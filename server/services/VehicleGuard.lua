--[[
    RHODE GUARD ULTIMATE — VehicleGuard
      - signalement client du modèle à l'entrée en véhicule (conducteur) →
        détection de modèles interdits (blacklist configurable)
      - compteur de véhicules DISTINCTS par joueur/minute → VEHICLE_FLOOD
      - export RegisterServerVehicle(netId, src) pour que tes scripts déclarent
        leurs créations légitimes; le garde suit ensuite les entités orphelines
      - sondage GetAllVehicles() côté serveur: croissance anormale → alerte staff

    Limite honnête: le spawn client n'est pas observable directement côté serveur;
    on s'appuie sur le signalement d'entrée + le comptage global d'entités.
]]

RHODE = RHODE or {}
RHODE.VehicleGuard = RHODE.VehicleGuard or {}

local registeredVehicles = {} -- [netId] = { src = src, at = epoch }
local playerModels = {}       -- [src] = { [modelHash] = epoch, ... }
local lastVehicleCount = nil

local function cfg()
    local detectors = (RHODE.Runtime and RHODE.Runtime.detectors) or Config.Modules
    return detectors.vehicle or Config.Modules.vehicle or {}
end

local function isInteger(value)
    return type(value) == 'number'
        and value == value
        and value ~= math.huge
        and value ~= -math.huge
        and value % 1 == 0
end

-- Le client ne fait que signaler une entrée. Le modèle et le siège conducteur
-- doivent correspondre à l'entité observée par le serveur (OneSync).
local function isAuthoritativeDriverVehicle(src, model, netId)
    if not isInteger(model) or model < 0 or model > 4294967295 then return false end
    if not isInteger(netId) or netId < 1 or netId > 65535 then return false end

    local ok, isVehicle, serverModel, driverPed, playerPed = pcall(function()
        local entity = NetworkGetEntityFromNetworkId(netId)
        if not entity or entity == 0 or not DoesEntityExist(entity) then
            return false
        end

        local ped = GetPlayerPed(src)
        return GetEntityType(entity) == 2,
            GetEntityModel(entity) & 0xffffffff,
            GetPedInVehicleSeat(entity, -1),
            ped
    end)

    return ok
        and isVehicle == true
        and serverModel == model
        and playerPed ~= nil
        and playerPed ~= 0
        and driverPed == playerPed
end

--- Tes scripts serveur appellent ceci pour déclarer un véhicule légitime.
function RHODE.VehicleGuard.Register(netId, src)
    registeredVehicles[netId] = { src = src, at = os.time() }
end

--- Traite le signalement client d'entrée en véhicule (conducteur).
function RHODE.VehicleGuard.Ingest(src, model, netId)
    local c = cfg()
    if not c.enabled or c.enabled == false then return end
    -- Limite les appels client avant toute résolution d'entité coûteuse.
    if not RHODE.RateLimit.Check(('player:%s:vehicle-report'):format(src), 10, 5) then return end
    if not isAuthoritativeDriverVehicle(src, model, netId) then return end

    local license = GetPlayerIdentifierByType(src, 'license')
    if not license then return end

    -- Blacklist de modèles
    local blacklist = c.blacklistedModels or {}
    if #blacklist > 0 then
        for _, bl in ipairs(blacklist) do
            if model == bl then
                RHODE.Evidence.Submit({
                    src = src, license = license, name = GetPlayerName(src) or '?',
                    module = 'vehicle', type = RHODE.TYPES.VEHICLE_MODEL,
                    severity = 'HIGH', confidence = 90,
                    source = RHODE.SOURCES.SERVEUR,
                    facts = { modele = model },
                    context = { note = 'modèle figurant sur la blacklist configurée' },
                })
                return
            end
        end
    end

    -- Flood: véhicules distincts par minute
    playerModels[src] = playerModels[src] or {}
    local now = os.time()
    playerModels[src][model] = now
    local distinct = 0
    for m, at in pairs(playerModels[src]) do
        if now - at > 60 then
            playerModels[src][m] = nil
        else
            distinct = distinct + 1
        end
    end
    local maxSpawns = c.maxSpawnsPerMin or 4
    if distinct > maxSpawns then
        local ok = RHODE.RateLimit.Check(('player:%s:vehflood'):format(src), 1, c.cooldown or 30)
        if ok then
            RHODE.Evidence.Submit({
                src = src, license = license, name = GetPlayerName(src) or '?',
                module = 'vehicle', type = RHODE.TYPES.VEHICLE_FLOOD,
                severity = 'MEDIUM', confidence = 78,
                source = RHODE.SOURCES.SERVEUR,
                facts = { vehiculesDistincts = distinct, maxParMinute = maxSpawns },
                context = { note = 'peut être légitime (garage, concession): vérifie le dossier' },
            })
            playerModels[src] = {}
        end
    end
end

-- Sondage global: croissance anormale du parc de véhicules serveur
CreateThread(function()
    while true do
        Wait(30000)
        local vehicles = GetAllVehicles()
        local count = vehicles and #vehicles or 0
        if lastVehicleCount ~= nil and count - lastVehicleCount > 30 then
            print(('^3[RHODE GUARD] ⚠ croissance rapide du parc de véhicules: %d → %d en 30 s (vérifie les spawns scripts)^0')
                :format(lastVehicleCount, count))
        end
        lastVehicleCount = count
    end
end)

--- Nettoyage périodique des enregistrements (cycle de vie borné).
CreateThread(function()
    while true do
        Wait(300000)
        local now = os.time()
        for netId, rec in pairs(registeredVehicles) do
            if now - rec.at > 3600 then
                registeredVehicles[netId] = nil
            end
        end
    end
end)

function RHODE.VehicleGuard.ClearPlayer(src)
    playerModels[src] = nil
end
