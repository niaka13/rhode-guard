--[[
    RHODE GUARD — sanctions automatiques avec preuves recoupées.
    Seules des observations autoritaires allowlistées peuvent contribuer au ban.
    Un signal client, un véhicule, un token invalide ou une alerte isolée ne bannit jamais.
]]

RHODE = RHODE or {}
RHODE.Bans = RHODE.Bans or {}

local recent = {} -- [license] = preuves serveur récentes, fenêtre bornée
local pending = {} -- [license] = true pendant l'écriture SQL
local TRUSTED = {
    speed = { SPEEDHACK = true },
    teleport = { TELEPORT = true },
    economy = { DUPLICATION = true }, -- conflit d'idempotence serveur
    EVENT_FLOOD = { EVENT_FLOOD = true },
    EVENT_INVALID = { EVENT_INVALID = true },
}

local function settings()
    return Config.AutoBan or {}
end

local function qualifies(evidence)
    if type(evidence) ~= 'table' or evidence.source ~= RHODE.SOURCES.SERVEUR then return false end
    local trustedTypes = TRUSTED[evidence.module]
    if not trustedTypes or not trustedTypes[evidence.type] then return false end

    local cfg = settings()
    local confidence = tonumber(evidence.confidence) or 0
    if confidence < (cfg.minConfidence or 88) then return false end
    if evidence.severity ~= 'MEDIUM' and evidence.severity ~= 'HIGH'
        and evidence.severity ~= 'CRITICAL' then return false end
    return true
end

RHODE.Bans.IsQualifyingEvidence = qualifies

local function countEvidence(rows)
    local modules, types = {}, {}
    local critical, trustedTeleportCount, trustedSpeedCount = false, 0, 0
    for i = 1, #rows do
        local entry = rows[i]
        modules[entry.module] = true
        types[entry.type] = true
        if entry.severity == 'CRITICAL' then critical = true end
        if entry.type == 'TELEPORT' then trustedTeleportCount = trustedTeleportCount + 1 end
        if entry.type == 'SPEEDHACK' then trustedSpeedCount = trustedSpeedCount + 1 end
    end
    local moduleCount, typeCount = 0, 0
    for _ in pairs(modules) do moduleCount = moduleCount + 1 end
    for _ in pairs(types) do typeCount = typeCount + 1 end
    return moduleCount, typeCount, critical, trustedTeleportCount, trustedSpeedCount
end

function RHODE.Bans.Assess(rows, cfg)
    cfg = cfg or settings()
    local modules, types, critical, teleports, speeds = countEvidence(rows or {})
    local enough = #(rows or {}) >= (cfg.threshold or 4)
        and modules >= (cfg.minModules or 2)
        and types >= (cfg.minTypes or 2)
    local severe = critical
        or teleports >= (cfg.repeatedTeleportThreshold or 4)
        or speeds >= (cfg.repeatedSpeedThreshold or 6)
    return enough and severe, {
        preuves = #(rows or {}), modules = modules, types = types,
        critique = critical, teleports = teleports, vitesses = speeds,
    }
end

function RHODE.Bans.GetLevel(priorBans, cfg)
    cfg = cfg or settings()
    local levels = cfg.levels or {}
    local index = math.max(1, math.floor(tonumber(priorBans) or 0) + 1)
    local level = levels[index] or levels[#levels]
    if not level then
        return { name = 'temporaire', durationHours = tonumber(cfg.durationHours) or 168 }
    end
    return level
end

function RHODE.Bans.Observe(evidence)
    local cfg = settings()
    if cfg.enabled ~= true or not qualifies(evidence) then return false end
    if not evidence.license or not evidence.src then return false end
    if RHODE.Permissions and RHODE.Permissions.IsBypassed(evidence.src) then return false end
    if not (RHODE.OxMySQL and RHODE.OxMySQL.Available()) then return false end
    if pending[evidence.license] then return false end

    local now = os.time()
    local window = math.max(60, tonumber(cfg.windowMinutes) or 10) * 60
    local rows = recent[evidence.license] or {}
    local kept = {}
    for i = 1, #rows do
        if now - rows[i].ts <= window then kept[#kept + 1] = rows[i] end
    end
    kept[#kept + 1] = {
        ts = now, module = evidence.module, type = evidence.type,
        severity = evidence.severity, confidence = evidence.confidence,
        incidentId = evidence.incidentId,
    }
    while #kept > 24 do table.remove(kept, 1) end
    recent[evidence.license] = kept

    local shouldBan, summary = RHODE.Bans.Assess(kept, cfg)
    if not shouldBan then return false end

    pending[evidence.license] = true
    local caseRef = evidence.caseRef or 'local'
    RHODE.OxMySQL.GetBanCount(evidence.license, function(priorBans, ready)
        if not ready then
            pending[evidence.license] = nil
            print(('^1[RHODE GUARD] sanction annulée : historique SQL indisponible (%s)^0'):format(caseRef))
            return
        end

        local level = RHODE.Bans.GetLevel(priorBans, cfg)
        local permanent = level.permanent == true
        local durationHours = math.max(1, tonumber(level.durationHours) or 168)
        local levelName = tostring(level.name or 'ban temporaire')
        local reason = ('Anti-cheat — %s : %d preuves serveur recoupées (%d catégories), dossier %s')
            :format(levelName, summary.preuves, summary.modules, caseRef)
        local ban = {
            license = evidence.license,
            reason = reason,
            caseRef = caseRef,
            level = levelName,
            issuedAt = now,
            expiresAt = permanent and 0 or now + durationHours * 3600,
            banCount = (tonumber(priorBans) or 0) + 1,
        }

        RHODE.OxMySQL.IssueBan(ban, function(saved)
            pending[evidence.license] = nil
            if not saved then
                print(('^1[RHODE GUARD] ban non appliqué : échec d’écriture SQL (%s)^0'):format(caseRef))
                return
            end

            local durationLabel = permanent and 'permanent' or (durationHours .. ' h')
            print(('^1[RHODE GUARD] sanction enregistrée (%s, niveau %d — %s, dossier %s)^0')
                :format(evidence.name or 'joueur', ban.banCount, durationLabel, caseRef))
            local src = tonumber(evidence.src)
            if src and GetPlayerName(src) and GetPlayerIdentifierByType(src, 'license') == evidence.license then
                DropPlayer(src, Config.Messages.banned:format(reason))
            end
            recent[evidence.license] = nil
        end)
    end)
    return true
end

function RHODE.Bans.ClearPlayer(src)
    local license = GetPlayerIdentifierByType(src, 'license')
    if license then recent[license] = nil end
end

RegisterCommand('rgunban', function(src, args)
    if src ~= 0 and not IsPlayerAceAllowed(src, 'rhode.staff') then
        TriggerClientEvent('chat:addMessage', src, { args = { 'RHODE GUARD', 'Accès refusé.' } })
        return
    end
    local license = tostring(args[1] or '')
    if not license:match('^license:[%da-fA-F]+$') then
        print('[RHODE GUARD] usage: rgunban license:identifiant')
        return
    end
    if not RHODE.OxMySQL or not RHODE.OxMySQL.Available() then
        print('[RHODE GUARD] déban impossible : oxmysql indisponible')
        return
    end
    RHODE.OxMySQL.RevokeBan(license, function(ok)
        print(ok and ('[RHODE GUARD] ban levé pour ' .. license)
            or '[RHODE GUARD] échec lors de la levée du ban')
    end)
end, false)
