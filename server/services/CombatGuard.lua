--[[
    RHODE GUARD ULTIMATE — CombatGuard
    Valide les signaux de dégâts agrégés envoyés par le client (lots de 10 s):
      - cadence de kills par attaquant (signaux fatals client)     [RG-CMB-001]
      - dégâts par coup (maxDamagePerHit)                          [RG-CMB-003]
      - armes interdites (blacklist de hashes)                     [RG-CMB-002]
      - AIMBOT: ratio headshots + distance médiane (fenêtre 5 min) [RG-CMB-004]
      - NO_RECOIL: variance de pitch ≈ 0 sur des rafales           [RG-CMB-005]
      - INFINITE_AMMO: tirs sans recharge                          [RG-CMB-006]
      - EXPLOSION_SPAM: explosions/min déclarées > quota           [RG-CMB-007]

    HONNÊTETÉ: FiveM n'offre PAS de vision serveur complète des tirs. Le client peut
    mentir (ne pas signaler) — ce guard détecte les excès DÉCLARÉS et les armes
    visibles dans les échanges réseau; un cheat discret de visée reste hors de portée
    sans ressources supplémentaires dédiées. L'AIMBOT repose sur des statistiques
    SOUTENUES (≥ aimMinShots coups) — jamais sur un événement isolé.
]]

RHODE = RHODE or {}
RHODE.CombatGuard = RHODE.CombatGuard or {}

local killTimes = {}   -- [src] = { t1, t2, ... }
local damageStrikes = {}
local aimWindow = {}   -- [src] = { {t, head, dist}, ... } — fenêtre glissante 5 min
local ammoStrikes = {} -- [src] = compteur de strikes INFINITE_AMMO

local function cfg()
    local detectors = (RHODE.Runtime and RHODE.Runtime.detectors) or Config.Modules
    return detectors.combat or Config.Modules.combat or {}
end

--- Retire les entrées plus vieilles que `seconds` d'une liste de timestamps {t,...}.
local function pruneWindow(list, seconds, now)
    local write = 1
    for j = 1, #list do
        if now - list[j].t < seconds then
            list[write] = list[j]
            write = write + 1
        end
    end
    for j = #list, write, -1 do list[j] = nil end
end

--- Statistiques de visée pures (testables hors FXServer).
--- @param win table de { head = boolean, dist = number }
--- @return table { n, headshots, ratio, distMoy }
function RHODE.CombatGuard.AimStats(win)
    local n, headshots, distSum = 0, 0, 0
    for i = 1, #win do
        local e = win[i]
        n = n + 1
        if e.head then headshots = headshots + 1 end
        distSum = distSum + (tonumber(e.dist) or 0)
    end
    return {
        n = n,
        headshots = headshots,
        ratio = n > 0 and headshots / n or 0,
        distMoy = n > 0 and distSum / n or 0,
    }
end

--- Traite un lot de dégâts signalés par un client (via main.lua).
--- `stats` = compteurs agrégés du lot: { shots, reloads, pitchMean, pitchVar, explosions }
function RHODE.CombatGuard.Ingest(src, events, stats)
    local c = cfg()
    if not c.enabled or c.enabled == false then return end
    if not events or type(events) ~= 'table' then return end

    local license = GetPlayerIdentifierByType(src, 'license')
    if not license then return end

    local now = os.time()
    killTimes[src] = killTimes[src] or {}

    -- ===== RG-CMB-004 AIMBOT: fenêtre glissante 5 min des coups sur joueurs =====
    aimWindow[src] = aimWindow[src] or {}
    local win = aimWindow[src]
    for i = 1, #events do
        local ev = events[i]
        if type(ev) == 'table' and ev.victimIsPlayer then
            win[#win + 1] = { t = now, head = ev.head == true, dist = tonumber(ev.dist) or 0 }
        end
    end
    pruneWindow(win, 300, now)

    local aimMinShots = c.aimMinShots or 12
    if #win >= aimMinShots then
        local s = RHODE.CombatGuard.AimStats(win)
        local minDist = c.aimMinDistance or 15.0
        if s.ratio >= (c.aimHeadshotRatio or 0.85) and s.distMoy >= minDist then
            RHODE.Evidence.Submit({
                src = src, license = license, name = GetPlayerName(src) or '?',
                module = 'combat', type = RHODE.TYPES.AIMBOT,
                severity = 'HIGH', confidence = 82,
                source = RHODE.SOURCES.CLIENT,
                facts = {
                    coups = s.n, headshots = s.headshots,
                    ratio = RHODE.Round(s.ratio, 2), distanceMoyenne = RHODE.Round(s.distMoy, 1),
                },
                context = { note = 'statistiques soutenues sur 5 min — revue humaine requise' },
            })
            win = {} -- évite le re-signalement à chaque lot
            aimWindow[src] = win
        end
    end

    -- ===== RG-CMB-005 NO_RECOIL + RG-CMB-006 INFINITE_AMMO (compteurs du lot) =====
    if stats and type(stats) == 'table' then
        local shots = tonumber(stats.shots) or 0
        -- NO_RECOIL: rafale soutenue avec variance de pitch quasi nulle
        local minBurst = c.recoilMinBurst or 10
        if shots >= minBurst and (tonumber(stats.pitchVar) or 1) <= (c.recoilMaxPitchVar or 0.15) then
            RHODE.Evidence.Submit({
                src = src, license = license, name = GetPlayerName(src) or '?',
                module = 'combat', type = RHODE.TYPES.NO_RECOIL,
                severity = 'MEDIUM', confidence = 75,
                source = RHODE.SOURCES.CLIENT,
                facts = { tirs = shots, variancePitch = RHODE.Round(stats.pitchVar or 0, 3) },
                context = { note = 'recul de caméra absent sur une rafale soutenue' },
            })
        end
        -- INFINITE_AMMO: tirs prolongés sans AUCUNE recharge signalée
        local ammoMin = c.ammoMinShots or 40
        if shots >= ammoMin and (tonumber(stats.reloads) or 0) == 0 then
            ammoStrikes[src] = (ammoStrikes[src] or 0) + 1
            if ammoStrikes[src] >= 2 then -- 2 lots consécutifs = signal soutenu
                ammoStrikes[src] = 0
                RHODE.Evidence.Submit({
                    src = src, license = license, name = GetPlayerName(src) or '?',
                    module = 'combat', type = RHODE.TYPES.INFINITE_AMMO,
                    severity = 'MEDIUM', confidence = 72,
                    source = RHODE.SOURCES.CLIENT,
                    facts = { tirs = shots, recharges = stats.reloads or 0 },
                    context = { note = 'tirs prolongés sans recharge signalée' },
                })
            end
        else
            ammoStrikes[src] = 0
        end
        -- EXPLOSION_SPAM: quota/min dépassé (valeur déclarée par le client)
        local quota = c.maxExplosionsPerMin or 3
        if (tonumber(stats.explosions) or 0) > quota then
            RHODE.Evidence.Submit({
                src = src, license = license, name = GetPlayerName(src) or '?',
                module = 'combat', type = RHODE.TYPES.EXPLOSION_SPAM,
                severity = 'HIGH', confidence = 85,
                source = RHODE.SOURCES.CLIENT,
                facts = { explosions = stats.explosions, quota = quota },
                context = { note = 'rafale d’explosions signalées par ce joueur' },
            })
        end
    end

    for i = 1, #events do
        local ev = events[i]
        if type(ev) == 'table' then
            -- Arme interdite ?
            local weapon = tonumber(ev.weapon) or 0
            local blacklist = c.blacklistedWeapons or Config.Modules.combat.blacklistedWeapons or {}
            if weapon ~= 0 and #blacklist > 0 then
                for _, bl in ipairs(blacklist) do
                    if weapon == bl then
                        RHODE.Evidence.Submit({
                            src = src, license = license, name = GetPlayerName(src) or '?',
                            module = 'combat', type = RHODE.TYPES.BLACKLIST_WEAPON,
                            severity = 'HIGH', confidence = 88,
                            source = RHODE.SOURCES.CLIENT,
                            facts = { arme = weapon },
                            context = { note = 'arme figurant sur la blacklist configurée' },
                        })
                        break
                    end
                end
            end

            -- Dégâts anormaux par coup
            local maxDmg = c.maxDamagePerHit or 200
            if ev.damage and tonumber(ev.damage) and ev.damage > maxDmg then
                damageStrikes[src] = (damageStrikes[src] or 0) + 1
                if damageStrikes[src] >= (c.strikes or 3) then
                    damageStrikes[src] = 0
                    RHODE.Evidence.Submit({
                        src = src, license = license, name = GetPlayerName(src) or '?',
                        module = 'combat', type = RHODE.TYPES.ONE_HIT_KILL,
                        severity = 'HIGH', confidence = 80,
                        source = RHODE.SOURCES.CLIENT,
                        facts = { degats = RHODE.Round(ev.damage, 0), max = maxDmg },
                        context = { limiteFauxPositifs = 'explosions/écrasements peuvent dépasser le seuil: ajuste-le en mode AUDIT' },
                    })
                end
            end

            -- Cadence de kills
            if ev.fatal and ev.victimIsPlayer then
                local times = killTimes[src]
                times[#times + 1] = now
                -- fenêtre 60 s
                local write = 1
                for j = 1, #times do
                    if now - times[j] < 60 then
                        times[write] = times[j]
                        write = write + 1
                    end
                end
                for j = #times, write, -1 do times[j] = nil end

                local maxKills = c.maxKillsPerMin or 20
                if #times > maxKills then
                    RHODE.Evidence.Submit({
                        src = src, license = license, name = GetPlayerName(src) or '?',
                        module = 'combat', type = RHODE.TYPES.WEAPON_CADENCE,
                        severity = 'MEDIUM', confidence = 75,
                        source = RHODE.SOURCES.CLIENT,
                        facts = { killsParMinute = #times, max = maxKills },
                        context = { note = 'comptage serveur des signaux fatals client' },
                    })
                    killTimes[src] = {}
                end
            end
        end
    end
end

function RHODE.CombatGuard.ClearPlayer(src)
    killTimes[src] = nil
    damageStrikes[src] = nil
    aimWindow[src] = nil
    ammoStrikes[src] = nil
end
