--[[
    RHODE GUARD ULTIMATE — Machine d'opérations économiques (§27/§28) — PUR
    États: REQUESTED → VALIDATED → IN_PROGRESS → SUCCEEDED | REJECTED | FAILED
           | COMPENSATION_REQUIRED. Le client ne choisit AUCUNE transition.
    Idempotence: même clé + même contenu → replay du résultat (aucun recrédit);
                 même clé + contenu différent → conflit (RG-ECO-002).

    Ce fichier est SANS native FiveM → testable (tests/test_operations.lua).
    EconomyGuard l'utilise en injectant natives + persistance oxmysql.
]]

RHODE = RHODE or {}
RHODE.OPS = RHODE.OPS or {}

RHODE.OPS.STATES = {
    REQUESTED = 'REQUESTED', VALIDATED = 'VALIDATED', IN_PROGRESS = 'IN_PROGRESS',
    SUCCEEDED = 'SUCCEEDED', REJECTED = 'REJECTED', FAILED = 'FAILED',
    COMPENSATION_REQUIRED = 'COMPENSATION_REQUIRED',
}

RHODE.OPS.TRANSITIONS = {
    REQUESTED           = { 'VALIDATED', 'REJECTED', 'FAILED' },
    VALIDATED           = { 'IN_PROGRESS', 'REJECTED', 'FAILED' },
    IN_PROGRESS         = { 'SUCCEEDED', 'FAILED', 'COMPENSATION_REQUIRED' },
    COMPENSATION_REQUIRED = { 'SUCCEEDED', 'FAILED' },
    SUCCEEDED           = {},
    REJECTED            = {},
    FAILED              = {},
}

--- Transition d'opération permise ? (refus par défaut)
function RHODE.OPS.CanTransition(from, to)
    local allowed = RHODE.OPS.TRANSITIONS[from]
    if not allowed then return false end
    for i = 1, #allowed do
        if allowed[i] == to then return true end
    end
    return false
end

--- États terminaux d'une opération.
function RHODE.OPS.IsTerminal(state)
    return state == 'SUCCEEDED' or state == 'REJECTED' or state == 'FAILED'
end

--[[ ============ IDEMPOTENCE (logique pure sur un store injecté) ============

    store = { [clé] = { payloadDigest, state, result, expiresAt } }

    Retour:
      { action = 'new' }                                    -- opération nouvelle
      { action = 'replay', state, result }                   -- même clé + même contenu → résultat précédent
      { action = 'conflict' }                                -- même clé + contenu DIFFÉRENT
      { action = 'expired' }                                 -- entrée expirée purgée, considérée nouvelle
]]

function RHODE.OPS.IdemBegin(store, key, payloadDigest, nowSec, ttl)
    local existing = store[key]
    if not existing then
        return { action = 'new' }
    end
    if existing.expiresAt and existing.expiresAt <= nowSec then
        store[key] = nil
        return { action = 'expired' }
    end
    if existing.payloadDigest == payloadDigest then
        return { action = 'replay', state = existing.state, result = existing.result }
    end
    return { action = 'conflict' }
end

--- Enregistre le résultat idempotent d'une opération terminée.
function RHODE.OPS.IdemCommit(store, key, payloadDigest, state, result, nowSec, ttl)
    store[key] = {
        payloadDigest = payloadDigest,
        state = state,
        result = result,
        expiresAt = (nowSec or os.time()) + (ttl or 600),
    }
end

--- Purge des entrées expirées (mémoire bornée).
function RHODE.OPS.IdemPurge(store, nowSec)
    local n = 0
    for k, v in pairs(store) do
        if v.expiresAt and v.expiresAt <= nowSec then
            store[k] = nil
            n = n + 1
        end
    end
    return n
end

--- Sérialisation canonique stable (clés triées) — empreinte de contenu.
function RHODE.OPS.Canonical(t)
    if type(t) ~= 'table' then
        if type(t) == 'string' then return '"' .. t .. '"' end
        return tostring(t)
    end
    local keys = {}
    for k in pairs(t) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    local parts = {}
    for _, k in ipairs(keys) do
        parts[#parts + 1] = k .. '=' .. RHODE.OPS.Canonical(t[k])
    end
    return '{' .. table.concat(parts, ';') .. '}'
end
