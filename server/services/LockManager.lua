--[[
    RHODE GUARD ULTIMATE — LockManager (§27.3: verrous par ordre déterministe)
    Les transferts J1↔J2 et J2↔J1 concurrents doivent prendre les verrous dans le
    MÊME ordre (clés triées) pour éviter tout interblocage.

    Garanties:
      - Acquire(keys): tri déterministe des clés, TTL 10 s (expiration prudente),
        re-entrant par détenteur (compteur), jamais de blocage durable ;
      - WithLocks(keys, fn): exécute fn sous pcall et LIBÈRE TOUJOURS les verrous
        (équivalent finally), même en erreur — retourne ok, résultat/erreur ;
      - métrique des verrous bloqués/expirés pour l'observabilité (§22).

    PURE (aucune native FiveM) → testable (tests/test_operations.lua).
    Limite documentée: verrous intra-processus FXServer. La coordination
    multi-serveurs exigerait des verrous consultatifs en base — hors périmètre,
    noté dans docs/FLUX.md.
]]

RHODE = RHODE or {}
RHODE.Locks = RHODE.Locks or {}

local DEFAULT_TTL = 10 -- secondes
local locks = {}       -- [key] = { holder = idToken, count = n, expiresAt = epoch, ownerCtx = ctx }
local metrics = { expired = 0, contended = 0, acquired = 0 }

local function nowSec()
    if RHODE.Locks._Now then return RHODE.Locks._Now() end
    return os.time()
end

local function newToken()
    return tostring(math.random(111111, 999999)) .. '-' .. tostring(os.time())
end

--- Tente d'acquérir un ensemble de clés (ordre déterministe interne).
--- @return string|nil token (nil si contention)
function RHODE.Locks.Acquire(keys, holderId)
    holderId = holderId or 'anon'
    local sorted = {}
    for i = 1, #keys do sorted[i] = tostring(keys[i]) end
    table.sort(sorted)

    local token = newToken()
    local acquired = {}

    for i = 1, #sorted do
        local key = sorted[i]
        local l = locks[key]
        local now = nowSec()

        -- expiration prudente: un verrou dépassé est repris (et compté)
        if l and l.expiresAt < now then
            metrics.expired = metrics.expired + 1
            locks[key] = nil
            l = nil
        end

        if l == nil then
            locks[key] = {
                holderId = holderId, count = 1,
                expiresAt = now + DEFAULT_TTL,
                tokens = { [token] = true }, -- registre des acquisitions ré-entrantes
            }
            acquired[#acquired + 1] = key
        elseif l.holderId == holderId then
            -- ré-entrant pour le même détenteur logique: chaque acquisition
            -- enregistre SON token — chaque Release libère exactement la sienne
            l.count = l.count + 1
            l.tokens[token] = true
            l.expiresAt = now + DEFAULT_TTL
            acquired[#acquired + 1] = key
        else
            -- contention: libère ce qui a été pris et échoue proprement
            metrics.contended = metrics.contended + 1
            for j = 1, #acquired do
                local k = acquired[j]
                local lk = locks[k]
                if lk and lk.tokens[token] then
                    lk.tokens[token] = nil
                    lk.count = lk.count - 1
                    if lk.count <= 0 then locks[k] = nil end
                end
            end
            return nil
        end
    end

    metrics.acquired = metrics.acquired + 1
    return token
end

--- Libère les verrous d'un token (ou réduit le compteur ré-entrant).
function RHODE.Locks.Release(token, keys)
    if not token then return end
    local sorted = {}
    for i = 1, #keys do sorted[i] = tostring(keys[i]) end
    table.sort(sorted)
    for i = 1, #sorted do
        local l = locks[sorted[i]]
        if l and l.tokens[token] then
            l.tokens[token] = nil
            l.count = l.count - 1
            if l.count <= 0 then locks[sorted[i]] = nil end
        end
    end
end

--- Exécute fn sous verrous avec libération garantie (pcall = finally équivalent).
--- @return boolean ok
--- @return any résultat de fn ou l'erreur
function RHODE.Locks.WithLocks(keys, holderId, fn)
    local token = RHODE.Locks.Acquire(keys, holderId)
    if not token then
        return false, 'LOCK_CONTENTION'
    end
    local ok, result = pcall(fn)
    RHODE.Locks.Release(token, keys)
    if ok then
        return true, result
    end
    return false, result
end

function RHODE.Locks.Metrics()
    return {
        acquired = metrics.acquired,
        contended = metrics.contended,
        expired = metrics.expired,
        held = (function() local n = 0 for _ in pairs(locks) do n = n + 1 end return n end)(),
    }
end

function RHODE.Locks._Reset()
    locks = {}
    metrics = { expired = 0, contended = 0, acquired = 0 }
end
