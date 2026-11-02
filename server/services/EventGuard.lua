--[[
    RHODE GUARD ULTIMATE — EventGuard
    Registre explicite des événements réseau sensibles + validation de schéma +
    rate-limit par joueur/action. Réponses sûres: rejet sobre, JAMAIS de divulgation
    des seuils internes dans le message renvoyé au joueur.

    Utilisation depuis TES ressources (server.lua):
      exports.rhode_guard:RegisterProtectedNetEvent('monjob:pay', {
          amount = 'number', missionId = 'string'
      }, function(src, data)
          -- data est validé: types conformes, bornes respectées
      end, { maxPerMin = 5 })

    Règles appliquées:
      1. validation stricte via RHODE.Schemas (types, bornes, tailles, profondeur)
      2. rate-limit par joueur et par événement
      3. rejets comptés comme strikes (EVENT_INVALID / EVENT_FLOOD après seuil)
      4. handler exécuté uniquement si tout passe
]]

RHODE = RHODE or {}
RHODE.EventGuard = RHODE.EventGuard or {}

local registry = {} -- [eventName] = { schema, handler, opts }
local rejections = {} -- [src] = { invalid = n, flood = n, lastTs }

--- Construit un schéma à partir d'une définition compacte:
--- { amount = 'number', note = 'string' } → bornes par défaut appliquées.
local function buildSchema(def)
    local schema = {}
    for field, kind in pairs(def) do
        if kind == 'number' then
            schema[field] = { type = 'number', required = false, min = -1e9, max = 1e9 }
        elseif kind == 'string' then
            schema[field] = { type = 'string', required = false, maxLen = 256 }
        elseif kind == 'boolean' then
            schema[field] = { type = 'boolean', required = false }
        elseif kind == 'table' then
            schema[field] = { type = 'table', required = false, maxLen = 64, maxDepth = 3 }
        elseif type(kind) == 'table' then
            -- définition détaillée directe { type=, min=, max=, maxLen=, required= }
            schema[field] = kind
        end
    end
    return schema
end

--- Enregistre un événement réseau protégé (usage interne + export).
function RHODE.EventGuard.Register(eventName, def, handler, opts)
    opts = opts or {}
    registry[eventName] = {
        schema = buildSchema(def),
        handler = handler,
        maxPerMin = opts.maxPerMin or 30,
    }
    RegisterNetEvent(eventName)
    AddEventHandler(eventName, function(...)
        local src = source
        RHODE.EventGuard.Handle(eventName, src, { ... })
    end)
end

--- Point d'entrée: valide puis exécute. Séparation claire rejet/silence.
function RHODE.EventGuard.Handle(eventName, src, args)
    local reg = registry[eventName]
    if not reg then return end

    -- bypass staff de confiance: pas de validation (développement/debug)
    if RHODE.Permissions and RHODE.Permissions.IsBypassed(src) then
        reg.handler(src, table.unpack(args))
        return
    end

    -- Rate-limit par joueur/événement
    local allowed = RHODE.RateLimit.Check(
        ('player:%s:evt:%s'):format(src, eventName), reg.maxPerMin, 60)
    if not allowed then
        RHODE.EventGuard.Strike(src, 'flood', eventName)
        return -- rejet silencieux côté joueur (log serveur uniquement)
    end

    -- Validation: le Lua variadique reçoit 1..n arguments; on rebuild une table
    -- en nommant les champs dans l'ordre du schéma (simplification sûre: les
    -- handlers protégés reçoivent TOUJOURS une table en 1er argument).
    local payload = args[1]
    local ok, err
    if type(payload) == 'table' then
        ok, err = RHODE.Validate(eventName, RHODE.EventGuard.MergeDefaults(eventName, payload))
        payload = RHODE.EventGuard.Merged
    else
        ok, err = false, 'payload invalide'
    end
    if not ok then
        RHODE.EventGuard.Strike(src, 'invalid', eventName, err)
        return
    end

    reg.handler(src, payload)
end

-- MergeDefaults: applique le schéma sur la payload (coercition nombres) et stocke le résultat.
function RHODE.EventGuard.MergeDefaults(eventName, payload)
    local reg = registry[eventName]
    local merged = {}
    if reg then
        for field, rules in pairs(reg.schema) do
            local v = payload[field]
            if v ~= nil then
                if rules.type == 'number' and type(v) == 'string' then v = tonumber(v) end
                if rules.type == 'number' and v and (v ~= v or v == math.huge) then v = nil end
                merged[field] = v
            end
        end
    end
    RHODE.EventGuard.Merged = merged
    return merged
end

--- Comptage des rejets → incidents EVENT_INVALID / EVENT_FLOOD (signal serveur).
function RHODE.EventGuard.Strike(src, kind, eventName, detail)
    local rec = rejections[src] or { invalid = 0, flood = 0, lastTs = 0 }
    rejections[src] = rec
    rec[kind] = rec[kind] + 1
    local now = os.time()
    rec.lastTs = now

    local threshold = 10
    -- Le premier signalement n'a pas encore de lastReported. Mettre le repli
    -- dans l'opérande de soustraction évite une erreur arithmétique sur nil.
    if rec[kind] >= threshold and (now - (rec.lastReported or 0)) > 60 then
        rec.lastReported = now
        rec[kind] = 0
        local license = GetPlayerIdentifierByType(src, 'license')
        if license and RHODE.Evidence then
            RHODE.Evidence.Submit({
                src = src,
                license = license,
                name = GetPlayerName(src) or '?',
                module = kind == 'flood' and 'EVENT_FLOOD' or 'EVENT_INVALID',
                type = kind == 'flood' and RHODE.TYPES.EVENT_FLOOD or RHODE.TYPES.EVENT_INVALID,
                severity = 'HIGH',
                confidence = 90,
                source = RHODE.SOURCES.SERVEUR,
                facts = {
                    evenement = eventName,
                  rejets = kind,
                },
                context = { note = 'rejets répétés sur événement protégé' },
            })
        end
    end
end

function RHODE.EventGuard.Registry()
    local names = {}
    for name in pairs(registry) do names[#names + 1] = name end
    return names
end

function RHODE.EventGuard.ClearPlayer(src)
    rejections[src] = nil
end
