--[[
    RHODE GUARD ULTIMATE — Adapter ESX Legacy
    Détection automatique + wrappers tolérants (pcall). ESX reste maître de ses
    données: cet adapter fournit du CONTEXTE (métier, compte bancaire au moment
    d'un incident) pour enrichir les preuves, sans jamais écrire dans ESX.

    HONNÊTETÉ: intercepter xPlayer.addMoney globalement n'est pas possible sans
    modifier ESX. La protection économique passe par EconomyGuard (exports) dans
    TES scripts — stratégie progressive documentée dans docs/SECURITE.md.
]]

RHODE = RHODE or {}
RHODE.Adapters = RHODE.Adapters or {}
RHODE.Adapters.ESX = {}

local ESX = nil
local available = false

CreateThread(function()
    -- attend le démarrage éventuel d'es_extended (jusqu'à 60 s)
    for _ = 1, 60 do
        if GetResourceState('es_extended') == 'started' then
            -- ESX Legacy expose l'objet via cet event serveur
            local loaded = false
            TriggerEvent('esx:getSharedObject', function(obj)
                ESX = obj
                loaded = true
            end)
            if loaded and ESX then break end
            Wait(2000)
        else
            Wait(1000)
        end
    end
    available = ESX ~= nil
    if available then
        print('^2[RHODE GUARD] adapter ESX Legacy actif (contexte économie enrichi)^0')
    else
        print('[RHODE GUARD] adapter ESX inactif — es_extended absent (fonctionnement normal sans contexte ESX)')
    end
end)

function RHODE.Adapters.ESX.Available()
    return available
end

--- Contexte joueur pour les preuves (lecture seule, pcall: jamais bloquant).
function RHODE.Adapters.ESX.GetContext(src)
    if not available then return nil end
    local ok, xPlayer = pcall(function() return ESX.GetPlayerFromId(src) end)
    if not ok or not xPlayer then return nil end
    local ok2, data = pcall(function()
        return {
            job = xPlayer.job and xPlayer.job.name or nil,
            grade = xPlayer.job and xPlayer.job.grade or nil,
            money = xPlayer.getMoney and xPlayer.getMoney() or nil,
            bank = xPlayer.getAccount and (xPlayer.getAccount('bank') or {}).money or nil,
        }
    end)
    if ok2 then return data end
    return nil
end
