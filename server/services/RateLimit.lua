--[[
    RHODE GUARD ULTIMATE — RateLimit (fenêtre glissante par clé)
    Clé typique: "player:<src>:<action>". Purge périodique pour borner la mémoire.

    Ce service n'utilise aucune native FiveM côté définition → testable hors FXServer
    (tests/test_ratelimit.lua) en injectant l'horloge.
]]

RHODE = RHODE or {}
RHODE.RateLimit = RHODE.RateLimit or {}

local buckets = {}   -- [key] = { times = {t1, t2, ...} }
local MAX_BUCKETS = 20000 -- borne mémoire globale

local function nowSec()
    -- Sur FXServer, os.time() est disponible côté serveur.
    -- Les tests injectent RHODE.RateLimit._Now pour maîtriser l'horloge.
    if RHODE.RateLimit._Now then return RHODE.RateLimit._Now() end
    return os.time()
end

--- Vérifie et consomme un jeton pour `key`.
--- @param key string clé (ex: "player:3:economy")
--- @param max number nombre max d'événements
--- @param windowSec number fenêtre en secondes
--- @return boolean allowed
--- @return number compte courant dans la fenêtre
function RHODE.RateLimit.Check(key, max, windowSec)
    local now = nowSec()
    local b = buckets[key]
    if not b then
        b = { times = {} }
        buckets[key] = b
    end

    -- Retire les entrées expirées (fenêtre glissante)
    local times = b.times
    local write = 1
    for i = 1, #times do
        if now - times[i] < windowSec then
            times[write] = times[i]
            write = write + 1
        end
    end
    for i = #times, write, -1 do times[i] = nil end

    if #times >= max then
        return false, #times
    end

    times[#times + 1] = now
    return true, #times
end

--- Nombre d'événements dans la fenêtre SANS consommer (lecture seule).
function RHODE.RateLimit.Count(key, windowSec)
    local now = nowSec()
    local b = buckets[key]
    if not b then return 0 end
    local count = 0
    for i = 1, #b.times do
        if now - b.times[i] < windowSec then count = count + 1 end
    end
    return count
end

--- Purge les buckets inactifs (appelé périodiquement par main.lua).
function RHODE.RateLimit.Cleanup(maxIdleSec)
    maxIdleSec = maxIdleSec or 600
    local now = nowSec()
    local total = 0
    for key, b in pairs(buckets) do
        local latest = b.times[#b.times] or 0
        if now - latest > maxIdleSec then
            buckets[key] = nil
        else
            total = total + 1
        end
        -- garde-fou mémoire
        if total > MAX_BUCKETS then buckets[key] = nil end
    end
end

--- Purge complète pour un joueur (déconnexion).
function RHODE.RateLimit.ClearPlayer(src)
    local prefix = 'player:' .. tostring(src) .. ':'
    for key in pairs(buckets) do
        if key:sub(1, #prefix) == prefix then
            buckets[key] = nil
        end
    end
end

--- Réinitialise tout (tests uniquement).
function RHODE.RateLimit._Reset()
    buckets = {}
end
