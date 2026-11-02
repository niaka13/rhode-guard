--[[
    RHODE GUARD ULTIMATE — Protocole partagé
    Constantes, types de détection, score de risque explicable.
    Ce fichier est volontairement SANS native FiveM → testable hors FXServer (tests/).
]]

RHODE = RHODE or {}

RHODE.VERSION = '2.4.0'

-- Types de détection (alignés avec le panel: voir src/lib/anticheat.ts VALID_TYPES)
RHODE.TYPES = {
    SPEEDHACK        = 'SPEEDHACK',
    TELEPORT         = 'TELEPORT',
    FLY_NOCLIP       = 'FLY_NOCLIP',
    SUPERJUMP        = 'SUPERJUMP',
    GODMODE          = 'GODMODE',
    INVISIBLE        = 'INVISIBLE',
    COLLISION_OFF    = 'COLLISION_OFF',
    WEAPON_CADENCE   = 'WEAPON_CADENCE',
    BLACKLIST_WEAPON = 'BLACKLIST_WEAPON',
    ONE_HIT_KILL     = 'ONE_HIT_KILL',
    AIMBOT           = 'AIMBOT',
    NO_RECOIL        = 'NO_RECOIL',
    INFINITE_AMMO    = 'INFINITE_AMMO',
    EXPLOSION_SPAM   = 'EXPLOSION_SPAM',
    VEHICLE_MODEL    = 'VEHICLE_MODEL',
    VEHICLE_FLOOD    = 'VEHICLE_FLOOD',
    ECONOMY_ANOMALY  = 'ECONOMY_ANOMALY',
    DUPLICATION      = 'DUPLICATION',
    TELEMETRY_MISMATCH = 'TELEMETRY_MISMATCH',
    EVENT_FLOOD      = 'EVENT_FLOOD',
    EVENT_INVALID    = 'EVENT_INVALID',
    SYSTEM_ALERT     = 'SYSTEM_ALERT', -- RG-SYS-001: file saturée / panne dépendance (opérateur)
}

-- Source du signal (le panel différencie la confiance)
RHODE.SOURCES = {
    CLIENT  = 'CLIENT',   -- signal faible déclaré par le client
    SERVEUR = 'SERVEUR',  -- mesure autoritaire côté serveur
    CROISEE = 'CROISEE',  -- écart entre déclarations client et mesures serveur
}

-- Événements réseau du protocole
RHODE.EVENTS = {
    TOKEN      = 'rhode_guard:token',
    REPORT     = 'rhode_guard:report',     -- client → serveur: signal d'un module
    ALIVE      = 'rhode_guard:alive',      -- client → serveur: signal de vie
    TELEMETRY  = 'rhode_guard:telemetry',  -- client → serveur: lot d'échantillons
    SPAWNED    = 'rhode_guard:spawned',    -- client → serveur: grace spawn
    DAMAGE     = 'rhode_guard:damage',     -- client → serveur: lot d'événements de dégâts
    VEHICLE    = 'rhode_guard:vehicle',    -- client → serveur: entrée véhicule (modèle)
    PLAYERREADY = 'rhode_guard:playerReady',
}

-- ============ SCORE DE RISQUE EXPLICABLE ============
-- Pondération par sévérité — identique au panel (SEVERITY_WEIGHT).
RHODE.SEVERITY_WEIGHT = {
    LOW = 1, MEDIUM = 2, HIGH = 4, CRITICAL = 6,
}

--- Calcule un score de risque additionnel pour un type donné.
--- Retourne (score, contributions) — explicable, jamais une boîte noire.
--- Le score N'EST PAS une sanction: il oriente la revue humaine (dossiers).
function RHODE.ComputeRisk(types)
    local total = 0
    local contributions = {}
    for i = 1, #types do
        local t = types[i]
        local w = RHODE.SEVERITY_WEIGHT[t.severity] or 1
        total = total + w
        contributions[#contributions + 1] = {
            type = t.type,
            severity = t.severity,
            weight = w,
        }
    end
    return total, contributions
end

--- Round utilitaire (utilisé partout, y compris par les tests).
function RHODE.Round(n, digits)
    digits = digits or 0
    local m = 10 ^ digits
    return math.floor((tonumber(n) or 0) * m + 0.5) / m
end

--- Mode d'exécution autorisant une action contraignante ?
--- OBSERVATION/AUDIT → jamais de rollback/kick punitif (l'intégrité token reste applicable).
function RHODE.ModeAllowsEnforce(mode)
    return mode == 'ENFORCE'
end
