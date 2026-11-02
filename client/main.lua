--[[
    RHODE GUARD ULTIMATE — Client: signaux faibles
    Détections mouvement (speedhack, téléport, fly, noclip, super saut, godmode,
    invisibilité), capture de dégâts et de véhicules.

    PRINCIPE: le client n'est JAMAIS une preuve. Il envoie des signaux au serveur avec
    un token tournant; le serveur croise avec SES propres mesures (MovementGuard) et
    décide. Un client compromis peut mentir ou se taire — le watchdog et la télémétrie
    croisée couvrent ces cas.
]]

local token = nil
local strikes = {}
local lastReport = {}
local graceUntil = 0

-- Historique local
local lastPos = nil
local lastCheck = nil
local airTime = 0
local noCollTime = 0
local invincibleTime = 0
local invisibleTime = 0

-- Buffer dégâts (envoyé par lots — pas un event par balle)
local damageBuffer = {}
local lastDamageFlush = 0

local function debugPrint(...)
    if Config.Debug then print('[RHODE GUARD client]', ...) end
end

RegisterNetEvent(RHODE.EVENTS.TOKEN, function(t)
    token = t
end)

-- Grâces: spawn, mort puis réapparition
AddEventHandler('playerSpawned', function()
    graceUntil = GetGameTimer() + (Config.Modules.teleport.graceSpawnSec or 8) * 1000
    airTime, noCollTime = 0, 0
    TriggerServerEvent(RHODE.EVENTS.SPAWNED, token)
end)

-- Grâce entrée/sortie de véhicule
local function vehicleGrace()
    graceUntil = math.max(graceUntil, GetGameTimer() + 1500)
end
AddEventHandler('baseevents:enteredVehicle', vehicleGrace)
AddEventHandler('baseevents:leftVehicle', vehicleGrace)

--[[ Conditions globales: pas de détection pendant pause menu, mort,
     chargement de collision, ou période de grâce ]]
local function canCheck(ped)
    if not token then return false end
    if GetGameTimer() < graceUntil then return false end
    if IsPauseMenuActive() then return false end
    if IsPedDeadOrDying(ped, true) then return false end
    if IsEntityWaitingForWorldCollision(ped) then return false end
    return true
end

--[[ Signale un module au serveur si les strikes suffisent (le serveur revalide) ]]
local function report(module, payload)
    local cfg = Config.Modules[module]
    if not cfg or not cfg.enabled then return end
    local now = GetGameTimer()
    if lastReport[module] and (now - lastReport[module]) < cfg.cooldown * 1000 then return end
    strikes[module] = (strikes[module] or 0) + 1
    if strikes[module] >= cfg.strikes then
        strikes[module] = 0
        lastReport[module] = now
        local ped = PlayerPedId()
        local pos = GetEntityCoords(ped)
        payload = payload or {}
        payload.position = { RHODE.Round(pos.x, 2), RHODE.Round(pos.y, 2), RHODE.Round(pos.z, 2) }
        payload.speed = RHODE.Round(GetEntitySpeed(ped), 2)
        payload.inVehicle = IsPedInAnyVehicle(ped, false)
        payload.gameTimer = now
        TriggerServerEvent(RHODE.EVENTS.REPORT, token, module, payload)
        debugPrint('signalement:', module)
    end
end

--[[ Décrément des strikes avec le temps (anti accumulation de faux positifs) ]]
CreateThread(function()
    while true do
        Wait(5000)
        for module, cfg in pairs(Config.Modules) do
            if strikes[module] and strikes[module] > 0 then
                -- retrait progressif: une strike par période decay/2
                strikes[module] = math.max(0, strikes[module] - 0.5)
            end
        end
    end
end)

--[[ ============ BOUCLE PRINCIPALE ============ ]]
CreateThread(function()
    Wait(3000) -- laisse le jeu se charger

    while true do
        Wait(750)
        local ped = PlayerPedId()

        if not canCheck(ped) then
            lastPos = GetEntityCoords(ped)
            lastCheck = GetGameTimer()
        else
            local now = GetGameTimer()
            local coords = GetEntityCoords(ped)
            local speed = GetEntitySpeed(ped)
            local inVehicle = IsPedInAnyVehicle(ped, false)
            local vehicle = inVehicle and GetVehiclePedIsIn(ped, false) or 0

            -- 1) TÉLÉPORT (delta position entre deux ticks)
            if lastPos and lastCheck then
                local dt = (now - lastCheck) / 1000.0
                if dt > 0.1 then
                    local delta = #(coords - lastPos)
                    local maxDelta = 120 * (inVehicle and 3 or 1)
                    if delta > maxDelta then
                        report('teleport', {
                            delta = RHODE.Round(delta, 1),
                            temps = RHODE.Round(dt, 2),
                            vitesse = RHODE.Round(delta / dt, 1),
                        })
                    end
                end
            end
            lastPos = coords
            lastCheck = now

            -- 2) SPEEDHACK
            if not inVehicle then
                local maxSpeed = IsPedSwimming(ped) and Config.Modules.speedhack.maxSpeedSwim or Config.Modules.speedhack.maxSpeedOnFoot
                if speed > maxSpeed and not IsPedRagdoll(ped) then
                    report('speedhack', {
                        vitesse = RHODE.Round(speed, 2),
                        max = maxSpeed,
                        contexte = IsPedSwimming(ped) and 'nage' or 'a pied',
                    })
                end
            else
                local maxVeh = GetVehicleEstimatedMaxSpeed(vehicle)
                if maxVeh and maxVeh > 0 and speed > maxVeh * Config.Modules.speedhack.vehicleMargin then
                    report('speedhack', {
                        vitesse = RHODE.Round(speed, 2),
                        maxVehicule = RHODE.Round(maxVeh, 2),
                        contexte = 'vehicule',
                    })
                end
            end

            -- 3) FLY (en l'air sans raison légitime)
            local inAir = IsEntityInAir(ped) and not inVehicle
            local legitAir = IsPedInParachuteFreeFall(ped) or IsPedClimbing(ped) or IsPedRagdoll(ped)
            if inAir and not legitAir then
                local vz = GetEntityVelocity(ped).z
                if vz > -(Config.Modules.fly.maxFallSpeed) then
                    airTime = airTime + 0.75
                    if airTime > Config.Modules.fly.minAirTime then
                        report('fly', { tempsEnAir = RHODE.Round(airTime, 1), vitesseVerticale = RHODE.Round(vz, 2) })
                    end
                else
                    airTime = 0
                end
            else
                airTime = 0
            end

            -- 4) NOCLIP (pas de collision en mouvement)
            if not inVehicle and not inAir then
                if not HasEntityCollidedWithAnything(ped) and speed > 1.0 then
                    noCollTime = noCollTime + 0.75
                    if noCollTime > Config.Modules.noclip.minTime then
                        report('noclip', { tempsSansCollision = RHODE.Round(noCollTime, 1) })
                    end
                else
                    noCollTime = 0
                end
            else
                noCollTime = 0
            end

            -- 5) SUPERJUMP (vélocité verticale au décollage)
            if IsPedJumping(ped) then
                local vz = GetEntityVelocity(ped).z
                if vz > Config.Modules.superjump.maxJumpVelocity then
                    report('superjump', { velociteVerticale = RHODE.Round(vz, 2) })
                end
            end

            -- 6) GODMODE
            if GetPlayerInvincible(PlayerId()) then
                invincibleTime = invincibleTime + 0.75
                if invincibleTime > Config.Modules.godmode.minDuration then
                    report('godmode', { duree = RHODE.Round(invincibleTime, 1) })
                end
            else
                invincibleTime = 0
            end

            -- 7) INVISIBLE
            if not IsEntityVisible(ped) or not IsEntityVisibleToScript(ped) then
                invisibleTime = invisibleTime + 0.75
                if invisibleTime > Config.Modules.invisible.minDuration then
                    report('invisible', { duree = RHODE.Round(invisibleTime, 1) })
                end
            else
                invisibleTime = 0
            end
        end
    end
end)

--[[ ============ DÉGÂTS (signal agrégé, validation côté serveur) ============
     CEventNetworkEntityDamage: [1]=victime, [2]=attaquant, [3]?=arme, [8]?=fatal
     Le client peut mentir → le serveur agrège et compare aux seuils, jamais une
     sanction sur un seul événement. ]]
AddEventHandler('gameEventTriggered', function(name, args)
    if name ~= 'CEventNetworkEntityDamage' then return end
    if not token then return end

    local victim = args[1]
    local attacker = args[2]
    if not victim or not attacker then return end
    if attacker ~= PlayerPedId() then return end -- on ne signale que ce que CE client inflige

    local ped = PlayerPedId()
    local vcoords = DoesEntityExist(victim) and GetEntityCoords(victim) or vector3(0, 0, 0)
    local pcoords = GetEntityCoords(ped)

    -- RG-CMB-004 (AIMBOT): le serveur calcule le ratio de headshots + distance médiane.
    -- Le client peut mentir → ce n'est qu'un signal agrégé, corroboration serveur.
    local bone = -1
    local ok, hitBone = pcall(function() return GetPedLastDamageBone(victim) end)
    if ok and hitBone and hitBone ~= 0 then bone = hitBone end

    -- RG-CMB-005 (NO_RECOIL): pitch caméra au moment du tir (le recul fait monter le pitch)
    local camPitch = 0.0
    local okCam, pitch = pcall(function()
        local c = GetGameplayCamRot(2)
        return c.x
    end)
    if okCam then camPitch = RHODE.Round(pitch, 2) end

    damageBuffer[#damageBuffer + 1] = {
        weapon = tonumber(args[3]) or 0,
        victimIsPlayer = IsPedAPlayer(victim),
        dist = RHODE.Round(#(vcoords - pcoords), 1),
        fatal = args[8] == true or args[8] == 1,
        head = bone == 31086,  -- 31086 = SKEL_Head (RB: os crâne)
        pitch = camPitch,       -- RG-CMB-005
    }
    if #damageBuffer > 24 then table.remove(damageBuffer, 1) end -- borne mémoire
end)

--[[ ============ TIRS / MUNITIONS / RECHARGE (RG-CMB-005/006) ============
     Comptages discrets: nombre de tirs, recharges signalées, pitch par tir.
     Envoyés avec le lot de dégâts pour corroboration serveur. ]]
local shotStats = { shots = 0, reloads = 0, pitchSum = 0, pitchSumSq = 0, lastAmmo = -1 }
CreateThread(function()
    Wait(5000)
    while true do
        Wait(250)
        if token then
            local ped = PlayerPedId()
            if IsPedShooting(ped) then
                shotStats.shots = shotStats.shots + 1
                local okC, pitch = pcall(function()
                    local c = GetGameplayCamRot(2)
                    return c.x
                end)
                if okC then
                    shotStats.pitchSum = shotStats.pitchSum + pitch
                    shotStats.pitchSumSq = shotStats.pitchSumSq + (pitch * pitch)
                end
            end
            if IsPedReloading(ped) then
                if not shotStats._reloadFlag then
                    shotStats.reloads = shotStats.reloads + 1
                    shotStats._reloadFlag = true
                end
            else
                shotStats._reloadFlag = false
            end
        end
    end
end)

--[[ ============ EXPLOSIONS (RG-CMB-007) ============
     CEventNetworkExpllosion: [1]=entité liée, [8]=possession/nom, [49]=position.
     On ne signale que les explosions DÉCLENCHÉES par CE joueur (champ possession). ]]
local explosionCount = 0
AddEventHandler('gameEventTriggered', function(name, args)
    if name ~= 'CEventNetworkExplission' and name ~= 'CEventNetworkExplosion' then return end
    if not token then return end
    explosionCount = explosionCount + 1
end)

-- Flush des dégâts par lots (toutes les 10 s ou 12 événements)
CreateThread(function()
    while true do
        Wait(10000)
        if token then
            local stats = shotStats
            local mean = stats.shots > 0 and (stats.pitchSum / stats.shots) or 0
            TriggerServerEvent(RHODE.EVENTS.DAMAGE, token, damageBuffer, {
                shots = stats.shots,
                reloads = stats.reloads,
                pitchMean = RHODE.Round(mean, 2),
                pitchVar = stats.shots > 1 and RHODE.Round(math.max(0, (stats.pitchSumSq / stats.shots) - mean * mean), 3) or 0,
                explosions = explosionCount,
            })
            damageBuffer = {}
            shotStats = { shots = 0, reloads = 0, pitchSum = 0, pitchSumSq = 0, lastAmmo = -1 }
            explosionCount = 0
        end
    end
end)

--[[ ============ VÉHICULES: signale l'entrée avec le modèle (validation serveur) ============ ]]
local reportedVehicles = {}
AddEventHandler('baseevents:enteredVehicle', function(vehicle, seat)
    if not token or seat ~= -1 then return end -- le signal ne concerne que le conducteur
    local model = GetEntityModel(vehicle) & 0xffffffff
    if reportedVehicles[model] then return end
    reportedVehicles[model] = true
    TriggerServerEvent(RHODE.EVENTS.VEHICLE, token, model, NetworkGetNetworkIdFromEntity(vehicle))
end)

-- Signal de vie: si un cheat neutralise ce script, le serveur s'en aperçoit (watchdog)
CreateThread(function()
    while true do
        Wait(60000)
        if token then TriggerServerEvent(RHODE.EVENTS.ALIVE, token) end
    end
end)
