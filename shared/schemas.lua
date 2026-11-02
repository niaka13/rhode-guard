--[[
    RHODE GUARD ULTIMATE — Schémas de validation des événements sensibles
    Utilisé par EventGuard (côté serveur) pour rejeter types inattendus, valeurs hors
    bornes, NaN/infinis, chaînes excessives et tables trop profondes.

    Ce fichier est SANS native FiveM → testable hors FXServer (tests/test_schemas.lua).
]]

RHODE = RHODE or {}

--- Schémas nommés: { champ = { type='number'|'string'|'boolean', min?, max=?, maxLen?, required? } }
RHODE.Schemas = {
    ['rhode_guard:report'] = {
        token    = { type = 'string', required = true, maxLen = 64 },
        module   = { type = 'string', required = true, maxLen = 32 },
        payload  = { type = 'table',  required = true, maxDepth = 3 },
    },
    ['rhode_guard:telemetry'] = {
        token    = { type = 'string', required = true, maxLen = 64 },
        samples  = { type = 'table',  required = true, maxLen = 32, maxDepth = 3 },
    },
    ['rhode_guard:damage'] = {
        token    = { type = 'string', required = true, maxLen = 64 },
        events   = { type = 'table',  required = true, maxLen = 24, maxDepth = 3 },
        stats    = { type = 'table',  maxDepth = 3 }, -- compteurs tirs/recharges/explosions (RG-CMB-004..007)
    },
    ['rhode_guard:vehicle'] = {
        token    = { type = 'string', required = true, maxLen = 64 },
        model    = { type = 'number', required = true, min = 0, max = 4294967295 },
        netId    = { type = 'number', min = 0, max = 4294967295 },
    },
    ['rhode_guard:spawned'] = {
        token    = { type = 'string', required = true, maxLen = 64 },
    },
    ['rhode_guard:alive'] = {
        token    = { type = 'string', required = true, maxLen = 64 },
    },
}

local MAX_STRING = 256 -- taille max par chaîne individuelle (hors token)

--- Valide une table de données contre un schéma.
--- @return boolean ok
--- @return string|nil erreur (sobre, sans divulguer les seuils internes)
function RHODE.Validate(schemaName, data)
    local schema = RHODE.Schemas[schemaName]
    if not schema then
        return false, 'schema inconnu'
    end
    if type(data) ~= 'table' then
        return false, 'payload invalide'
    end

    for field, rules in pairs(schema) do
        local value = data[field]

        if value == nil then
            if rules.required then
                return false, 'champ manquant'
            end
            goto continue
        end

        if rules.type == 'number' then
            if type(value) ~= 'number' then
                -- FiveM transmet parfois les nombres en string depuis le client
                if type(value) == 'string' then value = tonumber(value) end
                if type(value) ~= 'number' then return false, 'type invalide' end
                data[field] = value
            end
            if value ~= value or value == math.huge or value == -math.huge then
                return false, 'valeur non numérique' -- NaN / infinis
            end
            if rules.min and value < rules.min then return false, 'valeur hors bornes' end
            if rules.max and value > rules.max then return false, 'valeur hors bornes' end

        elseif rules.type == 'string' then
            if type(value) ~= 'string' then return false, 'type invalide' end
            if #value > (rules.maxLen or MAX_STRING) then return false, 'chaîne excessive' end

        elseif rules.type == 'boolean' then
            if type(value) ~= 'boolean' then return false, 'type invalide' end

        elseif rules.type == 'table' then
            if type(value) ~= 'table' then return false, 'type invalide' end
            if rules.maxLen then
                local count = 0
                for _ in pairs(value) do count = count + 1 end
                if count > rules.maxLen then return false, 'tableau excessif' end
            end
            if rules.maxDepth and RHODE.TableDepth(value) > rules.maxDepth then
                return false, 'profondeur excessive'
            end
        end

        ::continue::
    end

    return true, nil
end

--- Profondeur maximale d'une table (protection contre payloads imbriqués malveillants).
function RHODE.TableDepth(t, seen)
    if type(t) ~= 'table' then return 0 end
    seen = seen or {}
    if seen[t] then return 0 end -- cycle
    seen[t] = true
    local max = 0
    for _, v in pairs(t) do
        local d = RHODE.TableDepth(v, seen)
        if d > max then max = d end
    end
    seen[t] = nil
    return 1 + max
end
