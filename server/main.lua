--[[
    RHODE GUARD ULTIMATE — Serveur: orchestrateur
    Bootstrap, vérification des dépendances, protocole joueur (token tournant),
    gestion des signaux clients (validation schéma + rate-limit), synchronisation
    des réglages panel (mode + kill-switch détecteurs), heartbeat, watchdog,
    exports pour ton gamemode.

    Frontière de confiance: TOUT ce qui vient du client est non fiable →
    schéma + token + rythme; le serveur décide seul; le panel sanctionne seul
    (et seulement en mode ENFORCE).
]]

-- ============================================================
-- RUNTIME (synchronisé depuis le panel via /api/v1/config)
-- ============================================================
RHODE.Runtime = {
    mode = Config.DefaultMode or 'AUDIT',
    detectors = Config.Modules,
    autoSanction = { enabled = false, windowMinutes = 10, criticalThreshold = 3, autoBanHours = 168 },
    -- §16.1: état de santé explicite — INITIALISATION → PRET | DEGRADE → ARRET
    -- PRÊT n'est atteint que si les contrôles critiques réussissent.
    state = 'INITIALISATION',
    startedAt = os.time(),
}

--- Fait évoluer l'état de santé (journalisé, jamais silencieux).
function RHODE.Runtime.SetState(newState, reason)
    if RHODE.Runtime.state == newState then return end
    local old = RHODE.Runtime.state
    RHODE.Runtime.state = newState
    print(('^3[RHODE GUARD] état: %s → %s%s^0'):format(old, newState, reason and (' (' .. reason .. ')') or ''))
    -- un passage à PRÊT/DÉGRADÉ est notifié au panel au prochain heartbeat
end

--- Nombre de détecteurs actifs (santé/heartbeat).
local function countActiveDetectors()
    local active, total = 0, 0
    for _, d in pairs(RHODE.Runtime.detectors) do
        total = total + 1
        if d.enabled ~= false then active = active + 1 end
    end
    return active, total
end

-- ============================================================
-- CLIENT HTTP PANEL (santé + file de rejeu)
-- ============================================================
RHODE.Panel = RHODE.Panel or {}
local panelHealthy = true
local lastPanelOk = 0

function RHODE.Panel.IsConfigured()
    return Config.PanelURL and Config.PanelURL ~= '' and Config.ApiKey and Config.ApiKey ~= ''
        and Config.ApiKey ~= 'REMPLACER-PAR-LA-CLE-API'
end

function RHODE.Panel.IsHealthy()
    if not RHODE.Panel.IsConfigured() then return false end
    return panelHealthy or (os.time() - lastPanelOk) < Config.PanelHealthTimeout
end

--- Requête HTTP vers le panel (callback status, data).
function RHODE.Panel.Request(method, path, body, cb)
    if not RHODE.Panel.IsConfigured() then
        if cb then cb(0, nil) end
        return
    end
    PerformHttpRequest(Config.PanelURL .. path, function(status, response)
        if status == 200 then
            panelHealthy = true
            lastPanelOk = os.time()
            -- panel revenu → rejeu de la file de preuves
            if RHODE.Evidence and RHODE.Evidence.QueueSize() > 0 then
                RHODE.Evidence.FlushQueue()
            end
        elseif status == 0 or status >= 500 then
            panelHealthy = false
        end
        if cb then cb(status, response and json.decode(response) or nil) end
    end, method, body and json.encode(body) or '', {
        ['Content-Type'] = 'application/json',
        ['X-API-Key'] = Config.ApiKey,
    })
end

function RHODE.Panel.Post(path, body, cb)
    RHODE.Panel.Request('POST', path, body, cb)
end

function RHODE.Panel.Get(path, cb)
    RHODE.Panel.Request('GET', path, nil, cb)
end

-- ============================================================
-- ÉTAT JOUEURS (token tournant, vie, identifiers)
-- ============================================================
local playerTokens = {}   -- [src] = token secret
local lastAlive = {}      -- [src] = epoch du dernier signal de vie

local function extractLicense(src)
    return GetPlayerIdentifierByType(src, 'license')
end

local function extractIdentifiers(src)
    local ids = {}
    for _, idType in ipairs({ 'license', 'steam', 'discord', 'xbl', 'live', 'fivem', 'ip' }) do
        local id = GetPlayerIdentifierByType(src, idType)
        if id then ids[idType] = id end
    end
    return ids
end

local function extractHwids(src)
    local hwids = {}
    local n = GetNumPlayerTokens(src)
    for i = 0, n - 1 do
        hwids[#hwids + 1] = GetPlayerToken(src, i)
    end
    return hwids
end

local function rotateToken(src)
    local token = ('%s-%s-%s'):format(math.random(111111, 999999), os.time(), math.random(1111, 9999))
    playerTokens[src] = token
    TriggerClientEvent(RHODE.EVENTS.TOKEN, src, token)
end

-- ============================================================
-- CONNEXION: vérification de ban via le panel (deferrals)
-- ============================================================
AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
    local src = source
    deferrals.defer()
    Wait(0)
    deferrals.update(Config.Messages.checking)

    local license = extractLicense(src)
    if not license then
        deferrals.done()
        return
    end

    -- Le stockage local est prioritaire: les bans persistent même sans panel.
    if RHODE.OxMySQL and RHODE.OxMySQL.Available() then
        local localDone, localBan, localReady = false, nil, false
        local localWaited = 0
        repeat
            localDone = false
            RHODE.OxMySQL.CheckActiveBan(license, function(ban, ready)
                localBan, localReady, localDone = ban, ready, true
            end)
            local queryWaited = 0
            while not localDone and queryWaited < 1000 do
                Wait(100)
                queryWaited = queryWaited + 100
                localWaited = localWaited + 100
            end
            if not localReady and not localBan and localWaited < Config.BanCheckTimeout then
                Wait(200)
                localWaited = localWaited + 200
            end
        until localReady or localBan or localWaited >= Config.BanCheckTimeout
        if localDone and localBan then
            local reason = localBan.reason or 'Sanction RHODE GUARD active'
            deferrals.done(Config.Messages.banned:format(reason))
            return
        elseif not localReady then
            print('^3[RHODE GUARD] stockage local des bans indisponible à la connexion^0')
        end
    end

    if not RHODE.Panel.IsConfigured() then
        deferrals.done() -- mode autonome; la liste locale a déjà été consultée
        return
    end

    local done = false
    local verdict = nil
    RHODE.Panel.Get(('/bans/check?identifier=%s'):format(license), function(status, data)
        if not done then
            done = true
            verdict = { status = status, data = data }
        end
    end)

    local waited = 0
    while not done and waited < Config.BanCheckTimeout do
        Wait(100)
        waited = waited + 100
    end

    if not verdict then
        -- panel injoignable: fail-open documenté (mets true pour fail-closed strict)
        print('^3[RHODE GUARD] panel injoignable à la connexion — fail-open (voir config/server.lua)^0')
        deferrals.done()
        return
    end

    if verdict.status == 200 and verdict.data and verdict.data.banned then
        local reason = (verdict.data.ban and verdict.data.ban.reason) or 'Aucun motif'
        deferrals.done(Config.Messages.banned:format(reason))
        return
    end

    deferrals.done()
end)

-- ============================================================
-- ARRIVÉE / DÉPART
-- ============================================================
AddEventHandler('playerJoining', function()
    local src = source
    if RHODE.Permissions.IsBypassed(src) and Config.Debug then
        print(('[RHODE GUARD] bypass actif pour %s'):format(GetPlayerName(src) or src))
    end
    rotateToken(src)
    lastAlive[src] = os.time()
    RHODE.MovementGuard.AddGrace(src, 10) -- grâce join (streaming, spawn initial)
end)

RegisterNetEvent(RHODE.EVENTS.PLAYERREADY, function()
    local src = source
    local license = extractLicense(src)
    if not license then return end
    if RHODE.Panel.IsConfigured() then
        RHODE.Panel.Post('/ingest/players', {
            event = 'join',
            license = license,
            name = GetPlayerName(src),
            identifiers = extractIdentifiers(src),
            hwid = extractHwids(src)[1],
        })
    end
    print(('[RHODE GUARD] %s connecté — surveillé (mode %s)'):format(
        GetPlayerName(src) or src, RHODE.Runtime.mode))
end)

AddEventHandler('playerDropped', function(reason)
    local src = source
    local license = extractLicense(src)
    if license and RHODE.Panel.IsConfigured() then
        RHODE.Panel.Post('/ingest/players', {
            event = 'leave',
            license = license,
            name = GetPlayerName(src) or 'Inconnu',
        })
    end
    playerTokens[src] = nil
    lastAlive[src] = nil
    RHODE.MovementGuard.ClearPlayer(src)
    RHODE.CombatGuard.ClearPlayer(src)
    RHODE.VehicleGuard.ClearPlayer(src)
    RHODE.Economy.ClearPlayer(src)
    RHODE.EventGuard.ClearPlayer(src)
    RHODE.Permissions.ClearPlayer(src)
    RHODE.RateLimit.ClearPlayer(src)
    if RHODE.Bans then RHODE.Bans.ClearPlayer(src) end
    RHODE.Case.Close(license or tostring(src))
end)

-- ============================================================
-- SIGNAUX CLIENT (token + schéma + rate-limit, TOUJOURS)
-- ============================================================

--- Garde-fou commun: token valide OU rejet.
local function tokenOk(src, token)
    if playerTokens[src] and playerTokens[src] == token then
        return true
    end
    -- token invalide = tentative de spoof → incident d'intégrité
    print(('^1[RHODE GUARD] ⚠ %s: token invalide (spoof?)^0'):format(GetPlayerName(src) or src))
    local license = extractLicense(src)
    if license and RHODE.Evidence then
        RHODE.Evidence.Submit({
            src = src, license = license, name = GetPlayerName(src) or '?',
            module = 'anticheat', type = RHODE.TYPES.EVENT_INVALID,
            severity = 'CRITICAL', confidence = 96,
            source = RHODE.SOURCES.SERVEUR,
            facts = { note = 'signal client avec token invalide (rotation attendue)' },
            context = { integrity = true },
        })
    end
    if Config.AntiSpoof.kickOnSpoof then
        DropPlayer(src, Config.Messages.kicked)
    end
    return false
end

RegisterNetEvent(RHODE.EVENTS.ALIVE, function(token)
    local src = source
    local ok = RHODE.Validate(RHODE.EVENTS.ALIVE, { token = token })
    if not ok or not tokenOk(src, token) then return end
    lastAlive[src] = os.time()
end)

RegisterNetEvent(RHODE.EVENTS.SPAWNED, function(token)
    local src = source
    local ok = RHODE.Validate(RHODE.EVENTS.SPAWNED, { token = token })
    if not ok or not tokenOk(src, token) then return end
    RHODE.MovementGuard.ClientSpawned(src)
end)

RegisterNetEvent(RHODE.EVENTS.TELEMETRY, function(token, samples)
    local src = source
    local ok = RHODE.Validate(RHODE.EVENTS.TELEMETRY, { token = token, samples = samples })
    if not ok or not tokenOk(src, token) then return end
    -- rate-limit généreux: 1 lot / 3 s minimum
    local allowed = RHODE.RateLimit.Check(('player:%s:telemetry'):format(src), 1, 3)
    if allowed then
        RHODE.MovementGuard.IngestTelemetry(src, samples)
    end
end)

RegisterNetEvent(RHODE.EVENTS.DAMAGE, function(token, events, stats)
    local src = source
    local ok = RHODE.Validate(RHODE.EVENTS.DAMAGE, { token = token, events = events, stats = stats })
    if not ok or not tokenOk(src, token) then return end
    RHODE.CombatGuard.Ingest(src, events, stats)
end)

RegisterNetEvent(RHODE.EVENTS.VEHICLE, function(token, model, netId)
    local src = source
    local ok = RHODE.Validate(RHODE.EVENTS.VEHICLE, { token = token, model = model, netId = netId })
    if not ok or not tokenOk(src, token) then return end
    RHODE.VehicleGuard.Ingest(src, model, netId)
end)

--[[ Signalement d'un module client (signal FAIBLE → corroboration serveur) ]]
RegisterNetEvent(RHODE.EVENTS.REPORT, function(token, module, payload)
    local src = source
    local ok = RHODE.Validate(RHODE.EVENTS.REPORT, { token = token, module = module, payload = payload })
    if not ok then return end
    if not tokenOk(src, token) then return end

    -- module connu et activé ?
    if not Config.Modules[module] or not Config.Severity[module] then return end
    local runtimeCfg = RHODE.Runtime.detectors[module]
    if runtimeCfg and runtimeCfg.enabled == false then return end

    -- rate-limit global des signalements clients
    local allowed = RHODE.RateLimit.Check(
        ('player:%s:reports'):format(src), Config.AntiSpoof.maxEventsPerMin, 60)
    if not allowed then
        local license = extractLicense(src)
        if license and RHODE.Evidence then
            RHODE.Evidence.Submit({
                src = src, license = license, name = GetPlayerName(src) or '?',
                module = 'anticheat', type = RHODE.TYPES.EVENT_FLOOD,
                severity = 'HIGH', confidence = 92,
                source = RHODE.SOURCES.SERVEUR,
                facts = { note = 'rafale de signalements client au-delà du quota/minute' },
                context = {},
            })
        end
        return
    end

    if RHODE.Permissions.IsBypassed(src) then return end

    local license = extractLicense(src)
    if not license then return end

    -- Le signal client est transmis avec source CLIENT; le serveur a déjà ses
    -- propres mesures (MovementGuard) — le panel recoupe les deux.
    RHODE.Evidence.Submit({
        src = src,
        license = license,
        name = GetPlayerName(src) or '?',
        module = module,
        type = module == 'noclip' and RHODE.TYPES.COLLISION_OFF
            or module == 'fly' and RHODE.TYPES.FLY_NOCLIP
            or module:upper(),
        severity = Config.Severity[module],
        confidence = 82, -- signal client: confiance bornée par principe
        source = RHODE.SOURCES.CLIENT,
        facts = payload,
        context = { corroboreServeur = RHODE.Case.Summary(license) ~= nil },
    })
end)

-- ============================================================
-- THREADS: token rotation, config sync, heartbeat, watchdog, cleanup
-- ============================================================

-- Rotation des tokens joueurs
CreateThread(function()
    while true do
        Wait(Config.AntiSpoof.tokenRefresh * 1000)
        for _, src in ipairs(GetPlayers()) do
            rotateToken(tonumber(src))
        end
    end
end)

-- Synchronisation des réglages panel (mode + kill-switch + seuils)
CreateThread(function()
    while true do
        Wait((Config.ConfigSyncInterval or 60) * 1000)
        if RHODE.Panel.IsConfigured() then
            RHODE.Panel.Get('/config', function(status, data)
                if status == 200 and data and data.ok then
                    local changed = RHODE.Runtime.mode ~= data.mode
                    RHODE.Runtime.mode = data.mode or RHODE.Runtime.mode
                    if data.detectors then
                        -- fusion: les seuils panel surchargent les seuils locaux
                        for module, det in pairs(data.detectors) do
                            RHODE.Runtime.detectors[module] = det
                        end
                    end
                    if data.autoSanction then
                        RHODE.Runtime.autoSanction = data.autoSanction
                    end
                    if changed then
                        print(('^3[RHODE GUARD] mode panel appliqué: %s^0'):format(RHODE.Runtime.mode))
                    end
                end
            end)
        end
    end
end)

-- Heartbeat panel (enrichi §16.1: état de santé, file de preuves, détecteurs actifs)
CreateThread(function()
    while true do
        Wait((Config.HeartbeatInterval or 60) * 1000)
        if RHODE.Panel.IsConfigured() then
            local active = countActiveDetectors()
            -- réévalue l'état: panel injoignable ou file saturée → DÉGRADÉ
            if not RHODE.Panel.IsHealthy() or RHODE.Evidence.QueueSize() >= 150 then
                RHODE.Runtime.SetState('DEGRADE', RHODE.Evidence.QueueSize() >= 150 and 'file de preuves presque saturée' or 'panel injoignable')
            elseif RHODE.Runtime.state == 'DEGRADE' then
                RHODE.Runtime.SetState('PRET')
            end
            RHODE.Panel.Post('/ingest/heartbeat', {
                onlinePlayers = #GetPlayers(),
                maxPlayers = GetConvarInt('sv_maxclients', 48),
                version = RHODE.VERSION,
                state = RHODE.Runtime.state,
                queueSize = RHODE.Evidence.QueueSize(),
                detectorsActive = active,
            })
        end
    end
end)

-- Watchdog: client silencieux = boucle possiblement neutralisée
CreateThread(function()
    while true do
        Wait(120000)
        local now = os.time()
        for _, src in ipairs(GetPlayers()) do
            src = tonumber(src)
            if not RHODE.Permissions.IsBypassed(src)
                and playerTokens[src]
                and lastAlive[src]
                and (now - lastAlive[src]) > (Config.AntiSpoof.watchdogSilence or 300) then
                print(('^3[RHODE GUARD] ⚠ %s: aucun signal client depuis %ds — observation RG-01, aucune sanction automatique^0')
                    :format(GetPlayerName(src) or src, now - lastAlive[src]))
                if Config.AntiSpoof.kickOnSilentClient == true
                    and RHODE.ModeAllowsEnforce(RHODE.Runtime and RHODE.Runtime.mode or 'OBSERVATION') then
                    DropPlayer(src, '[RHODE GUARD] Vérification anti-cheat échouée (code RG-01).')
                end
            end
        end
    end
end)

-- Nettoyages périodiques (mémoire bornée)
CreateThread(function()
    while true do
        Wait(300000)
        RHODE.RateLimit.Cleanup(600)
        RHODE.Case.Cleanup()
    end
end)

-- ============================================================
-- EXPORTS POUR TON GAMEMODE (actions nommées, bornées, auditées)
-- ============================================================

--- Autorise un téléport légitime (garage, event, admin TP) — grace + trace.
exports('AuthorizeTeleport', function(src, reason)
    RHODE.MovementGuard.AddGrace(src, 5)
    if Config.Debug then
        print(('[RHODE GUARD] téléport autorisé: %s (%s)'):format(GetPlayerName(src) or src, reason or 'sans motif'))
    end
end)

--- Enregistre un événement réseau protégé (voir EventGuard).
exports('RegisterProtectedNetEvent', function(name, def, handler, opts)
    RHODE.EventGuard.Register(name, def, handler, opts)
end)

--- Validation économique (API v2.0 conservée, désormais idempotente persistante).
exports('ValidateEconomyOp', function(src, amount, reason, idemKey)
    return RHODE.Economy.ValidateOp(src, amount, reason, idemKey)
end)

--- Démarre une opération économique idempotente (§27): machine à états + journal.
--- Retourne op ou nil + motif. Voir EconomyGuard (docs/FLUX.md).
exports('BeginEconomyOp', function(src, opType, params, idemKey)
    return RHODE.Economy.BeginOperation(src, opType, params, idemKey)
end)

--- Exécute fn sous verrous déterministes sur deux profils (transferts §27.3).
exports('WithTransferLocks', function(fromSrc, toSrc, fn)
    return RHODE.Economy.WithTransferLocks(fromSrc, toSrc, fn)
end)

--- Validation de transfert d'inventaire (voir InventoryGuard).
exports('ValidateItemTransfer', function(src, fromInv, toInv, item, count, idemKey)
    return RHODE.Inventory.ValidateTransfer(src, fromInv, toInv, item, count, idemKey)
end)

--- Déclare un véhicule créé par un script serveur légitime.
exports('RegisterServerVehicle', function(netId, src)
    RHODE.VehicleGuard.Register(netId, src)
end)

--- État du système (supervision externe).
exports('GetStatus', function()
    local active = countActiveDetectors()
    return {
        version = RHODE.VERSION,
        state = RHODE.Runtime.state,
        mode = RHODE.Runtime.mode,
        uptimeSec = os.time() - RHODE.Runtime.startedAt,
        detectorsActive = active,
        detectorsTotal = (function() local n = 0 for _ in pairs(RHODE.Runtime.detectors) do n = n + 1 end return n end)(),
        playersTracked = #GetPlayers(),
        panelConfigured = RHODE.Panel.IsConfigured(),
        panelHealthy = RHODE.Panel.IsHealthy(),
        evidenceQueue = RHODE.Evidence.QueueSize(),
        localCases = RHODE.Case.Count(),
        economy = RHODE.Economy.Stats(),
        movement = RHODE.MovementGuard.Stats(),
    }
end)

-- ============================================================
-- BANNIÈRE DE DÉMARRAGE
-- ============================================================
print([[
^2╔══════════════════════════════════════════════════════════╗
║  RHODE GUARD ULTIMATE v]] .. RHODE.VERSION .. [[ — anti-cheat défensif       ║
║  Auteur: Rhode RP' +                                      ║
╚══════════════════════════════════════════════════════════╝^0]])
print(('^2[RHODE GUARD] mode: %s | panel: %s | oxmysql local: %s^0'):format(
    RHODE.Runtime.mode,
    RHODE.Panel.IsConfigured() and Config.PanelURL or 'mode autonome',
    tostring(RHODE.OxMySQL.Available())))
print('[RHODE GUARD] rappel: étalonne en AUDIT avant ENFORCE; marque les faux positifs dans le panel.')

-- ============================================================
-- BOOTSTRAP v2.1 (§16.1): contrôles critiques puis PRÊT/DÉGRADÉ
-- ============================================================
CreateThread(function()
    Wait(5000) -- laisse les adapters détecter leurs dépendances

    local degraded = {}
    if RHODE.Panel.IsConfigured() and not RHODE.Panel.IsHealthy() then
        degraded[#degraded + 1] = 'panel injoignable au démarrage'
    end
    if RHODE.OxMySQL.Available() then
        RHODE.OxMySQL.EnsureEconomyTables(function(ok, reason)
            if ok then
                RHODE.Economy.ReloadIdempotency()
            else
                degraded[#degraded + 1] = reason or 'schéma SQL indisponible'
            end
            if #degraded > 0 then
                RHODE.Runtime.SetState('DEGRADE', table.concat(degraded, ', '))
            else
                RHODE.Runtime.SetState('PRET')
            end
        end)
    else
        -- facultatif: pas de dégradation bloquante, mais journalisée
        degraded[#degraded + 1] = 'oxmysql absent (journal local désactivé)'
        RHODE.Runtime.SetState('DEGRADE', table.concat(degraded, ', '))
    end
end)

-- Arrêt propre: état ARRÊT + message clair (jamais de faux démarrage silencieux)
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    RHODE.Runtime.SetState('ARRET', 'arrêt demandé — les files sont rejetables au redémarrage via le journal')
end)
