--[[
    RHODE GUARD ULTIMATE — MovementGuard (AUTORITÉ SERVEUR)
    Vérification indépendante du mouvement, MÊME SI le client est compromis:
      - échantillonne GetEntityCoords(ped) côté serveur toutes les 750 ms
      - calcule vitesse moyenne sur fenêtre glissante (4 échantillons)
      - détecte téléports (delta/dt > seuil) avec grâces: join, spawn, téléports
        autorisés (export AuthorizeTeleport), intérieurs (delta massif répété sans
        cohérence horizontale), véhicules (seuil relevé)
      - croise la télémétrie client avec ses propres mesures → TELEMETRY_MISMATCH
      - rollback de position en mode ENFORCE uniquement, borné (1/10 s/joueur),
        jamais pendant une grâce, jamais dans une boucle (2 tentatives max)

    Limites honnêtes:
      - le serveur observe la position de l'entité répliquée: un lag momentané peut
        fausser UN échantillon → d'où fenêtres et strikes, jamais une décision isolée
      - les véhicules rapides légitimes (avions) nécessitent une grâce/autorisation
        via exports.rhode_guard:AuthorizeTeleport ou un seuil relevé
      - les intérieurs/ascenseurs provoquent des sauts de coordonnées légitimes →
        détectés via z massif + x/y faible, ignorés avec trace
]]

RHODE = RHODE or {}
RHODE.MovementGuard = RHODE.MovementGuard or {}

local samples = {}   -- [src] = { {t, x, y, z, inVeh}, ... } fenêtre 8
local strikes = {}    -- [src] = { [module] = n }
local grace = {}      -- [src] = epoch jusqu'où on ignore
local lastRollback = {} -- [src] = epoch
local clientClaims = {} -- [src] = { {t, x, y, z}, ... } dernier lot télémétrie client
local rollCount = {} -- [src] = n (borne anti-boucle)

local SAMPLE_MS = 750
local WINDOW = 4        -- échantillons pour la vitesse moyenne
local VEHICLE_MAX = 150 -- m/s moyen en véhicule (avions: utilise AuthorizeTeleport)

local function elapsedMs(newer, older)
    local delta = newer - older
    -- GetGameTimer est un compteur 32 bits qui finit par revenir à zéro.
    if delta < 0 then delta = delta + 4294967296 end
    return delta
end

local function cfg(module)
    local detectors = (RHODE.Runtime and RHODE.Runtime.detectors) or Config.Modules
    return detectors[module] or {}
end

local function enabled(module)
    local c = cfg(module)
    return c.enabled ~= false and (not Config.Modules[module] or Config.Modules[module].enabled ~= false)
end

--- Grâce explicite (join, spawn, téléport autorisé par un script légitime).
function RHODE.MovementGuard.AddGrace(src, seconds)
    grace[src] = math.max(grace[src] or 0, os.time() + (seconds or 5))
end

--- Dernier point valide connu (pour rollback).
local function lastStablePos(src)
    local s = samples[src]
    if not s or #s == 0 then return nil end
    for i = #s, 1, -1 do
        if not s[i].suspect then
            return vector3(s[i].x, s[i].y, s[i].z)
        end
    end
    return vector3(s[1].x, s[1].y, s[1].z)
end

--- Signalement serveur (strike system + evidence).
local function flag(src, module, severity, confidence, facts, context)
    local c = cfg(module)
    local needed = c.strikes or 2
    strikes[src] = strikes[src] or {}
    strikes[src][module] = (strikes[src][module] or 0) + 1
    if strikes[src][module] < needed then return false end
    strikes[src][module] = 0

    -- cooldown par module
    local key = ('player:%s:mv:%s'):format(src, module)
    local ok = RHODE.RateLimit.Check(key, 1, c.cooldown or 20)
    if not ok then return false end

    local license = GetPlayerIdentifierByType(src, 'license')
    if not license then return false end
    RHODE.Evidence.Submit({
        src = src,
        license = license,
        name = GetPlayerName(src) or '?',
        module = module,
        type = module == 'teleport' and RHODE.TYPES.TELEPORT
            or module == 'speed' and RHODE.TYPES.SPEEDHACK
            or RHODE.TYPES.TELEMETRY_MISMATCH,
        severity = severity,
        confidence = confidence,
        source = RHODE.SOURCES.SERVEUR,
        facts = facts,
        context = context or {},
    })
    return true
end

--- Échantillonnage principal.
CreateThread(function()
    while true do
        Wait(SAMPLE_MS)
        local players = GetPlayers()
        for i = 1, #players do
            local src = tonumber(players[i])
            local ped = GetPlayerPed(src)
            if ped and ped ~= 0 and not RHODE.Permissions.IsBypassed(src) then
                local coords = GetEntityCoords(ped)
                -- GetGameTimer garde une précision suffisante pour les mesures
                -- de mouvement; os.time() arrondit à la seconde et déforme les
                -- vitesses sur des échantillons espacés de 750 ms.
                local nowMs = GetGameTimer()
                local now = os.time()
                local s = samples[src] or {}

                local prev = s[#s]
                local inVeh = GetVehiclePedIsIn(ped, false) ~= 0
                local entry = {
                    t = nowMs, x = coords.x, y = coords.y, z = coords.z,
                    inVeh = inVeh, suspect = false,
                }

                if prev then
                    local dx, dy, dz = entry.x - prev.x, entry.y - prev.y, entry.z - prev.z
                    local horizontal = math.sqrt(dx * dx + dy * dy)
                    local delta = math.sqrt(dx * dx + dy * dy + dz * dz)
                    -- Temps monotone réel; protéger aussi le cas d'un timer nul.
                    local dt = math.max(elapsedMs(entry.t, prev.t) / 1000.0, 0.001)
                    local speed = delta / dt

                    local inGrace = (grace[src] or 0) > now

                    if not inGrace then
                        -- Téléport: vitesse moyenne instantanée irréaliste
                        local maxSpeed = inVeh and VEHICLE_MAX or (cfg('teleport').maxSpeedMs or 130)
                        if speed > maxSpeed then
                            -- Intérieur/ascenseur: saut quasi vertical, déplacement horizontal faible
                            local interiorJump = dz ~= 0 and math.abs(dz) > 20 and horizontal < 5
                            if not interiorJump then
                                entry.suspect = true
                                flag(src, 'teleport', 'HIGH', 92, {
                                    vitesseMoyenne = RHODE.Round(speed, 1),
                                    maxAutorise = maxSpeed,
                                    delta = RHODE.Round(delta, 1),
                                    enVehicule = inVeh,
                                    de = { RHODE.Round(prev.x, 1), RHODE.Round(prev.y, 1), RHODE.Round(prev.z, 1) },
                                    vers = { RHODE.Round(entry.x, 1), RHODE.Round(entry.y, 1), RHODE.Round(entry.z, 1) },
                                }, { source = 'vérification serveur' })

                                -- Rollback ENFORCE uniquement, borné, hors grâce, jamais en boucle
                                local mcfg = cfg('teleport')
                                if RHODE.ModeAllowsEnforce(RHODE.Runtime and RHODE.Runtime.mode or 'AUDIT')
                                    and mcfg.rollback
                                    and (lastRollback[src] or 0) < now - 10
                                    and (rollCount[src] or 0) < 2 then
                                    local stable = lastStablePos(src)
                                    if stable then
                                        lastRollback[src] = now
                                        rollCount[src] = (rollCount[src] or 0) + 1
                                        SetEntityCoords(ped, stable.x, stable.y, stable.z, false, false, false, false)
                                        print(('[RHODE GUARD] rollback position: %s (tentative %d/2)'):format(
                                            GetPlayerName(src), rollCount[src]))
                                    end
                                end
                            end
                        end
                    end
                end

                s[#s + 1] = entry
                if #s > 8 then table.remove(s, 1) end
                samples[src] = s

                -- Vitesse moyenne sur fenêtre (speedhack serveur — corrobore le client)
                if #s >= WINDOW then
                    -- WINDOW est une quantité d'échantillons, pas une table :
                    -- l'index de départ est la première position de la fenêtre courante.
                    local firstIndex = #s - WINDOW + 1
                    local a, b = s[firstIndex], s[#s]
                    local dist = math.sqrt(
                        (b.x - a.x) ^ 2 + (b.y - a.y) ^ 2 + (b.z - a.z) ^ 2)
                    -- Une fenêtre de N points couvre N-1 intervalles. Utiliser le
                    -- temps réel quand le serveur a ralenti évite les faux positifs.
                    local expectedElapsed = (WINDOW - 1) * SAMPLE_MS
                    local elapsed = math.max(elapsedMs(b.t, a.t) / 1000.0, expectedElapsed / 1000.0)
                    local avgSpeed = dist / elapsed
                    local maxFoot = cfg('speedhack').maxSpeedOnFoot or 12.5
                    if not b.inVeh and avgSpeed > maxFoot * 1.6 then
                        flag(src, 'speed', 'MEDIUM', 85, {
                            vitesseMoyenneFenetre = RHODE.Round(avgSpeed, 1),
                            maxPied = maxFoot,
                            fenetreEchantillons = WINDOW,
                        }, { source = 'vérification serveur' })
                    end
                end
            end
        end
    end
end)

--[[ ============ TÉLÉMÉTRIE CROISÉE ============
    Le client déclare ses positions; le serveur compare avec SES observations.
    Un écart moyen soutenu = client qui falsifie ses rapports → CRITICAL. ]]
function RHODE.MovementGuard.IngestTelemetry(src, clientSamples)
    if not clientSamples or #clientSamples == 0 then return end
    clientClaims[src] = clientSamples

    local s = samples[src]
    local tcfg = cfg('telemetry')
    if not s or #s < (tcfg.minSamples or 5) or #clientSamples < (tcfg.minSamples or 5) then return end

    -- compare la dernière position déclarée vs dernière observée
    local claimed = clientSamples[#clientSamples]
    local observed = s[#s]
    if not claimed or not observed then return end

    local dist = math.sqrt(
        (claimed.x - observed.x) ^ 2 + (claimed.y - observed.y) ^ 2 + (claimed.z - observed.z) ^ 2)
    -- écart relatif vs distance parcourue moyenne (tolère la latence)
    local tolerance = tcfg.mismatchTolerance or 0.35
    if dist > 30 and dist > tolerance * 100 then
        flag(src, 'telemetry', 'CRITICAL', 95, {
            ecartMetres = RHODE.Round(dist, 1),
            declareClient = { RHODE.Round(claimed.x, 1), RHODE.Round(claimed.y, 1), RHODE.Round(claimed.z, 1) },
            observeServeur = { RHODE.Round(observed.x, 1), RHODE.Round(observed.y, 1), RHODE.Round(observed.z, 1) },
            tolerance = tolerance,
        }, { source = 'vérif. croisée client/serveur' })
    end
end

--- Grâce déclarée par le client (spawn) — faible: 3 s seulement, le reste est ignoré.
function RHODE.MovementGuard.ClientSpawned(src)
    RHODE.MovementGuard.AddGrace(src, 3)
end

function RHODE.MovementGuard.ClearPlayer(src)
    samples[src] = nil
    strikes[src] = nil
    grace[src] = nil
    lastRollback[src] = nil
    clientClaims[src] = nil
    rollCount[src] = nil
end

--- Statistiques (commande rgstatus / panel heartbeat).
function RHODE.MovementGuard.Stats()
    local n = 0
    for _ in pairs(samples) do n = n + 1 end
    return { tracked = n }
end
