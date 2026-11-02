--[[
    RHODE GUARD ULTIMATE — EconomyGuard v2.1 (§16.3/§18/§27)
    S'appuie sur shared/operations.lua (machine à états + idempotence PURES et testées).

    Garanties:
      - machine à états REQUESTED → … → SUCCEEDED/REJECTED/FAILED (le client ne
        choisit aucune transition) ;
      - idempotence par clé (RHODE.OPS.IdemBegin): même clé + même contenu →
        replay du résultat SANS recrédit; même clé + contenu différent → conflit
        + incident CRITICAL (RG-ECO-002) ;
      - verrous déterministes (LockManager) pour les transferts J1↔J2 ;
      - journal d'opérations + idempotence persistés via oxmysql (asynchrone,
        jamais dans le chemin critique) et RECHARGÉS au démarrage → un retry
        après redémarrage ne recrédite pas.

    HONNÊTETÉ (garanties transactionnelles): ESX/ox_inventory n'exposent pas de
    transaction atomique multi-systèmes. Le journal permet une compensation
    idempotente documentée et une revue — pas une atomicité ACID. L'idempotence
    en mémoire est autoritaire au sein du processus FXServer (un seul par
    serveur); la couche SQL couvre la reprise après redémarrage. La coordination
    MULTI-serveurs exigerait des verrous consultatifs en base — hors périmètre,
    noté dans docs/FLUX.md.

    Utilisation (server.lua de ton job):
      local op = exports.rhode_guard:BeginEconomyOp(source, 'vente_ferme', { amount = 1250 }, 'job:vente:' .. saleId)
      if not op then return end
      -- ... vérifier état métier, appliquer via ESX ...
      op:Succeed({ credited = 1250 })   -- ou op:Reject('stock insuffisant') / op:Fail('db')
]]

RHODE = RHODE or {}
RHODE.Economy = RHODE.Economy or {}

local idempotency = {}  -- store injecté à RHODE.OPS (digest → {payloadDigest, state, result, expiresAt})
local refusals = {}     -- [src] = n
local IDEM_TTL = 600

local OPS = RHODE.OPS.STATES

local function nowSec()
    return os.time()
end

local function digest(s)
    return ('%08x'):format(GetHashString(tostring(s)))
end

local function cfg()
    local detectors = (RHODE.Runtime and RHODE.Runtime.detectors) or Config.Modules
    return detectors.economy or Config.Modules.economy or {}
end

--[[ ============ JOURNAL PERSISTANT (best-effort, jamais bloquant) ============ ]]

local function journalWrite(op)
    if not (RHODE.OxMySQL and RHODE.OxMySQL.Available()) then return end
    RHODE.OxMySQL.StoreOperation({
        license = op.license, opType = op.opType, state = op.state,
        idemKey = op.idemKeyDigest, payloadDigest = op.payloadDigest,
        amount = op.amount, resultCode = op.resultCode, result = op.result,
    })
end

--- Au démarrage: recharge les clés idempotentes non expirées (reprise après restart).
function RHODE.Economy.ReloadIdempotency(cb)
    if not (RHODE.OxMySQL and RHODE.OxMySQL.Available()) then
        if cb then cb(false, 'oxmysql indisponible') end
        return 0
    end
    RHODE.OxMySQL.LoadActiveIdempotency(function(rows, ready)
        if not ready then
            if cb then cb(false, 'rechargement idempotence SQL échoué') end
            return
        end
        local n = 0
        for i = 1, #(rows or {}) do
            local r = rows[i]
            idempotency[r.operation_key_digest] = {
                payloadDigest = r.payload_digest,
                state = r.status,
                result = r.result_json and json.decode(r.result_json) or nil,
                expiresAt = r.expires_at,
            }
            n = n + 1
        end
        if n > 0 then
            print(('[RHODE GUARD] économie: %d clé(s) d\'idempotence rechargée(s) depuis la base'):format(n))
        end
        if cb then cb(true) end
    end)
    return 0
end

--[[ ============ API PUBLIQUE ============ ]]

--- Démarre une opération idempotente. Retourne un objet op ou nil + motif.
--- Replay: op.replay = true + résultat précédent — le script appelant ne réexécute PAS.
function RHODE.Economy.BeginOperation(src, opType, params, idemKey)
    params = params or {}
    local c = cfg()
    if c.enabled == false then
        -- détecteur coupé: opération neutre (garde désactivée, décision assumée et journalisée au démarrage)
        return { state = OPS.VALIDATED, neutral = true, Succeed = function() end, Reject = function() end, Fail = function() end }
    end

    local license = GetPlayerIdentifierByType(src, 'license')
    if not license then return nil, 'joueur non identifié' end

    -- bornes de montant (le montant vient des paramètres SERVEUR du script appelant,
    -- jamais d'une valeur client brute — le script appelant doit le calculer)
    local amount = tonumber(params.amount)
    if amount ~= nil then
        if amount ~= amount or amount == math.huge or amount <= 0 or amount > (c.maxAmountPerOp or 500000) then
            return nil, RHODE.Economy.Refuse(src, 'montant hors bornes', opType, amount)
        end
    end

    -- idempotence (cœur pur testé: RHODE.OPS.IdemBegin)
    local idemKeyDigest, payloadDigest
    if idemKey and idemKey ~= '' then
        idemKeyDigest = digest(tostring(src) .. ':' .. idemKey)
        payloadDigest = digest(RHODE.OPS.Canonical({ opType = opType, params = params }))

        local verdict = RHODE.OPS.IdemBegin(idempotency, idemKeyDigest, payloadDigest, nowSec(), IDEM_TTL)
        if verdict.action == 'replay' then
            return {
                state = verdict.state, replay = true, result = verdict.result,
                Succeed = function() end, Reject = function() end, Fail = function() end,
            }, 'opération déjà traitée (replay idempotent)'
        elseif verdict.action == 'conflict' then
            -- même clé, contenu différent: tentative de manipulation → incident RG-ECO-002
            RHODE.Evidence.Submit({
                src = src, license = license, name = GetPlayerName(src) or '?',
                module = 'economy', type = RHODE.TYPES.DUPLICATION,
                severity = 'CRITICAL', confidence = 92,
                source = RHODE.SOURCES.SERVEUR,
                facts = {
                    note = 'clé d\'opération réutilisée avec un contenu différent',
                    operation = opType,
                },
                context = { idempotence = true },
            })
            return nil, 'opération déjà traitée (idempotence)'
        end
    end

    -- rythme par joueur
    local ok = RHODE.RateLimit.Check(('player:%s:economy'):format(src), c.maxOpsPerMin or 10, 60)
    if not ok then
        return nil, RHODE.Economy.Refuse(src, 'rythme excessif', opType, amount)
    end

    local op = {
        src = src, license = license, opType = opType, amount = amount,
        idemKeyDigest = idemKeyDigest, payloadDigest = payloadDigest,
        state = OPS.REQUESTED, resultCode = nil, result = nil,
    }

    --- Fait évoluer l'état via la machine PURE (refus par défaut, pcall-safe).
    local function moveTo(opObj, toState)
        if not RHODE.OPS.CanTransition(opObj.state, toState) then
            print(('^1[RHODE GUARD] bug interne: transition d\'opération invalide %s → %s^0'):format(opObj.state, toState))
            return false
        end
        opObj.state = toState
        return true
    end

    function op:Succeed(result)
        if self.replay or self.neutral then return end
        moveTo(self, OPS.VALIDATED)
        moveTo(self, OPS.IN_PROGRESS)
        moveTo(self, OPS.SUCCEEDED)
        self.result = result
        if self.idemKeyDigest then
            RHODE.OPS.IdemCommit(idempotency, self.idemKeyDigest, self.payloadDigest, OPS.SUCCEEDED, result, nowSec(), IDEM_TTL)
        end
        journalWrite(self)
    end

    function op:Reject(reasonCode)
        if self.replay or self.neutral then return end
        moveTo(self, OPS.REJECTED)
        self.resultCode = reasonCode
        if self.idemKeyDigest then
            RHODE.OPS.IdemCommit(idempotency, self.idemKeyDigest, self.payloadDigest, OPS.REJECTED, { reason = reasonCode }, nowSec(), IDEM_TTL)
        end
        journalWrite(self)
    end

    function op:Fail(reasonCode)
        if self.replay or self.neutral then return end
        moveTo(self, OPS.FAILED)
        self.resultCode = reasonCode
        journalWrite(self)
    end

    journalWrite(op)
    return op
end

--- API compatible v2.0 (validation simple avant application par le script métier).
function RHODE.Economy.ValidateOp(src, amount, reason, idemKey)
    local op, why = RHODE.Economy.BeginOperation(src, reason or 'operation', { amount = amount }, idemKey)
    if not op then
        return false, why
    end
    if op.replay then
        return false, 'opération déjà appliquée (idempotence)'
    end
    op:Succeed({ validated = true })
    return true
end

--- Refus compté + incident au-delà du seuil (jamais de modification de solde ici).
function RHODE.Economy.Refuse(src, why, reason, amount)
    local c = cfg()
    refusals[src] = (refusals[src] or 0) + 1
    local license = GetPlayerIdentifierByType(src, 'license')

    if refusals[src] >= (c.strikes or 2) and license then
        refusals[src] = 0
        local ok = RHODE.RateLimit.Check(('player:%s:econincident'):format(src), 1, c.cooldown or 60)
        if ok then
            RHODE.Evidence.Submit({
                src = src, license = license, name = GetPlayerName(src) or '?',
                module = 'economy', type = RHODE.TYPES.ECONOMY_ANOMALY,
                severity = 'HIGH', confidence = 85,
                source = RHODE.SOURCES.SERVEUR,
                facts = {
                    motif = why,
                    operation = reason,
                    montant = RHODE.Round(tonumber(amount) or 0, 2),
                },
                context = { note = 'refus répétés sur validation économique' },
            })
        end
    end
    return why
end

--- Transfert protégé: verrous déterministes sur les deux profils (§27.3).
function RHODE.Economy.WithTransferLocks(fromSrc, toSrc, fn)
    return RHODE.Locks.WithLocks(
        { 'player:' .. tostring(fromSrc), 'player:' .. tostring(toSrc) },
        'transfer:' .. tostring(math.min(fromSrc, toSrc)),
        fn
    )
end

function RHODE.Economy.ClearPlayer(src)
    refusals[src] = nil
end

function RHODE.Economy.Stats()
    local n = 0
    for _ in pairs(idempotency) do n = n + 1 end
    return { idempotencyKeys = n, locks = RHODE.Locks.Metrics() }
end

-- purge périodique des clés expirées (mémoire bornée)
CreateThread(function()
    while true do
        Wait(120000)
        RHODE.OPS.IdemPurge(idempotency, nowSec())
    end
end)
