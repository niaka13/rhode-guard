--[[
    RHODE GUARD ULTIMATE — Configuration partagée (client + serveur)
    Toutes les valeurs sont surchargables en live depuis le panel (RÉGLAGES → /api/v1/config).
    Principe: seuils généreux par défaut → étalonne en OBSERVATION puis AUDIT avant ENFORCE.

    Avertissement honnête: aucun seuil n'est parfait. Les grâces couvrent les cas légitimes
    connus (spawn, véhicules, ragdoll, téléports autorisés), mais un gamemode exotique peut
    nécessiter des ajustements. Surveille les faux positifs dans le panel avant d'agir.
]]

Config = Config or {}

Config.Version = '2.4.0'

-- ============ MODE DE DÉMARRAGE ============
-- OBSERVATION: journalise seulement (idéal étalonnage)
-- AUDIT:       journalise + alertes staff + dossiers (après étalonnage)
-- ENFORCE:     + rollback position / kick / auto-sanction via panel
-- Le mode réel est synchronisé depuis le panel toutes les 60 s.
Config.DefaultMode = 'OBSERVATION'

-- ============ BAN AUTOMATIQUE AUTONOME ============
-- Séparé du mode ENFORCE (qui active aussi d'autres actions telles que rollback).
-- Seules des preuves serveur allowlistées et recoupées peuvent déclencher un ban.

-- ============ DÉTECTEURS (seuils + strikes) ============
-- strikes: nombre de violations consécutives avant signalement
-- cooldown: secondes minimales entre deux signalements du même module
-- decay: une strike retire 1 strike après N secondes sans violation
Config.Modules = {
    -- --- Mouvement (signal client + vérification croisée serveur) ---
    speedhack = {
        enabled = true,
        maxSpeedOnFoot = 12.5,   -- m/s (sprint ~7; marge latence/streaming)
        maxSpeedSwim = 5.5,      -- m/s
        vehicleMargin = 1.25,    -- x vitesse max théorique du véhicule (client)
        strikes = 3, cooldown = 20, decay = 60,
    },
    teleport = {
        enabled = true,
        maxSpeedMs = 130,        -- m/s moyen côté SERVEUR avant strike (avions légitimes ~jusqu'à 250 → règle les grâces)
        graceSpawnSec = 8,       -- grâce après spawn/join
        strikes = 2, cooldown = 15, decay = 45,
        rollback = true,         -- ENFORCE uniquement: repositionne au dernier point valide
    },
    fly = {
        enabled = true,
        minAirTime = 3.5,        -- s en l'air sans véhicule/parachute/échelle (signal client)
        maxFallSpeed = 90,       -- m/s de chute légitime max (skydive ~80)
        strikes = 2, cooldown = 25, decay = 60,
    },
    noclip = {
        enabled = true,
        minTime = 2.0,           -- s sans collision en mouvement (signal client)
        strikes = 1, cooldown = 25, decay = 60,
    },
    superjump = {
        enabled = true,
        maxJumpVelocity = 9.0,   -- vélocité verticale d'un saut légitime ~8.4
        strikes = 2, cooldown = 20, decay = 60,
    },
    godmode = {
        enabled = true,
        minDuration = 5,         -- s d'invincibilité hors contexte (signal client)
        strikes = 2, cooldown = 30, decay = 90,
    },
    invisible = {
        enabled = true,
        minDuration = 3,         -- s d'invisibilité (signal client)
        strikes = 1, cooldown = 30, decay = 90,
    },
    -- --- Combat (signal client agrégé, validation serveur) ---
    combat = {
        enabled = true,
        maxKillsPerMin = 20,     -- kills signalés / min / attaquant
        maxDamagePerHit = 200,   -- dégâts signalés par coup (hors véhicules/explosions configurables)
        blacklistedWeapons = {}, -- hashes ou noms GetHashKey('WEAPON_XXX') à interdire
        -- AIMBOT (RG-CMB-004): statistiques serveur sur les coups déclarés
        aimMinShots = 12,        -- nb min de coups dans la fenêtre avant conclusion
        aimHeadshotRatio = 0.85, -- ratio de headshots au-dessus duquel on signale (85%)
        aimMinDistance = 15.0,   -- distance médiane min (m) pour écarter le corps-à-corps
        -- NO_RECOIL (RG-CMB-005): recul de caméra quasi nul sur des rafales
        recoilMinBurst = 10,     -- tirs min dans une rafale serrée
        recoilMaxPitchVar = 0.15, -- variation de pitch max (degrés) considérée comme "aucun recul"
        -- INFINITE_AMMO (RG-CMB-006): tirs sans recharge
        ammoMinShots = 40,       -- tirs consécutifs sans changement de chargeur
        -- EXPLOSION_SPAM (RG-CMB-007)
        maxExplosionsPerMin = 3, -- explosions/min/joueur au-delà du quota
        strikes = 3, cooldown = 30, decay = 60,
    },
    -- --- Véhicules ---
    vehicle = {
        enabled = true,
        maxSpawnsPerMin = 4,     -- véhicules distincts signalés / min / joueur
        blacklistedModels = {},  -- ex: { `deluxo`, `flyingcar` } — utilise des backticks (hash)
        strikes = 2, cooldown = 30, decay = 60,
    },
    -- --- Économie (via exports depuis tes scripts métier) ---
    economy = {
        enabled = true,
        maxAmountPerOp = 500000, -- $ max par opération validée
        maxOpsPerMin = 10,       -- opérations / min / joueur
        strikes = 2, cooldown = 60, decay = 120,
    },
    -- --- Télémétrie croisée (client vs serveur) ---
    telemetry = {
        enabled = true,
        mismatchTolerance = 0.35, -- écart relatif moyen toléré (35%)
        minSamples = 5,           -- échantillons avant conclusion
        strikes = 3, cooldown = 60, decay = 120,
    },
}

-- ============ SÉVÉRITÉ PAR MODULE (envoyée au panel) ============
Config.Severity = {
    speedhack = 'HIGH',
    teleport = 'HIGH',
    fly = 'CRITICAL',
    noclip = 'CRITICAL',
    superjump = 'MEDIUM',
    godmode = 'CRITICAL',
    invisible = 'HIGH',
    combat = 'HIGH',        -- cadence/dégâts anormaux
    vehicle = 'MEDIUM',     -- spawn en rafale
    economy = 'HIGH',       -- anomalie économique
    telemetry = 'CRITICAL', -- télémétrie falsifiée = client compromis
}

-- ============ TÉLÉMÉTRIE CLIENT ============
Config.Telemetry = {
    sampleMs = 750,        -- fréquence d'échantillonnage position/état
    batchSeconds = 5,      -- envoi par lots au serveur
    maxBatchSize = 24,     -- échantillons max par lot (borne mémoire/payload)
}

-- ============ PROTECTION ANTI-SPOOF ============
Config.AntiSpoof = {
    tokenRefresh = 120,      -- s: rotation du token joueur (le client ne peut pas deviner)
    maxEventsPerMin = 12,    -- signalements client max / joueur / minute
    kickOnSpoof = false,     -- observation initiale: éviter les faux positifs avant calibration
    watchdogSilence = 300,   -- s sans signal client → AC possiblement neutralisé
    kickOnSilentClient = false, -- aucun kick automatique sur silence client
}

-- ============ MESSAGES JOUEUR (sobres, sans divulgation des règles) ============
Config.Messages = {
    kicked = "[RHODE GUARD] Activité anormale détectée. Contacte le staff si tu penses à une erreur.",
    banned = "[RHODE GUARD] Tu es banni de ce serveur. Motif: %s",
    checking = "Vérification anti-cheat en cours...",
    econRefused = "Opération refusée.",
}
