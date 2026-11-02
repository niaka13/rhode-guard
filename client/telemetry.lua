--[[
    RHODE GUARD ULTIMATE — Client: télémétrie
    Échantillonne position/état à intervalle fixe et envoie par lots au serveur.
    Le serveur compare ces déclarations avec SES propres observations (MovementGuard):
    un écart soutenu = client qui falsifie ses rapports (TELEMETRY_MISMATCH, CRITICAL).

    Échantillonnage adaptatif: 750 ms normalement, 400 ms si le serveur demande
    une surveillance renforcée (drapeau haute attention).
]]

local buffer = {}
local highAttention = false
local lastSent = 0

RegisterNetEvent('rhode_guard:attention', function(flag)
    highAttention = flag and true or false
end)

CreateThread(function()
    Wait(5000) -- laisse le jeu se charger
    while true do
        Wait(highAttention and 400 or (Config.Telemetry.sampleMs or 750))
        local ped = PlayerPedId()
        if token and ped and ped ~= 0 then
            local coords = GetEntityCoords(ped)
            buffer[#buffer + 1] = {
                t = RHODE.Round(GetGameTimer() / 1000, 2), -- temps de jeu en s
                x = RHODE.Round(coords.x, 2),
                y = RHODE.Round(coords.y, 2),
                z = RHODE.Round(coords.z, 2),
                v = IsPedInAnyVehicle(ped, false) and 1 or 0,
                s = RHODE.Round(GetEntitySpeed(ped), 2),
            }
            -- coupe le buffer si le lot devient trop gros (borne mémoire/payload)
            if #buffer > (Config.Telemetry.maxBatchSize or 24) then
                table.remove(buffer, 1)
            end
        end
    end
end)

-- Envoi par lots
CreateThread(function()
    while true do
        Wait((Config.Telemetry.batchSeconds or 5) * 1000)
        if token and #buffer > 0 then
            TriggerServerEvent(RHODE.EVENTS.TELEMETRY, token, buffer)
            buffer = {}
            lastSent = GetGameTimer()
        end
    end
end)
