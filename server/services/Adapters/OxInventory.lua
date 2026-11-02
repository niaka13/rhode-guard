--[[
    RHODE GUARD ULTIMATE — Adapter ox_inventory
    Détection automatique + wrappers LECTURE SEULE (pcall). ox_inventory reste
    maître de l'état réel; l'adapter permet à InventoryGuard de recouper les
    quantités déclarées avec les quantités détenues (détection de duplication).
]]

RHODE = RHODE or {}
RHODE.Adapters = RHODE.Adapters or {}
RHODE.Adapters.OxInventory = {}

local available = false

CreateThread(function()
    for _ = 1, 60 do
        if GetResourceState('ox_inventory') == 'started' then
            available = true
            break
        end
        Wait(1000)
    end
    if available then
        print('^2[RHODE GUARD] adapter ox_inventory actif (recoupement des quantités)^0')
    else
        print('[RHODE GUARD] adapter ox_inventory inactif — ressource absente')
    end
end)

function RHODE.Adapters.OxInventory.Available()
    return available
end

--- Quantité d'un item détenue par un joueur (nil si indisponible — jamais une erreur).
function RHODE.Adapters.OxInventory.GetItemCount(src, item)
    if not available then return nil end
    local ok, count = pcall(function()
        return exports.ox_inventory:GetItemCount(src, item)
    end)
    if ok and type(count) == 'number' then return count end
    return nil
end

--- Inventaire synthétique (nil si indisponible).
function RHODE.Adapters.OxInventory.GetInventory(src)
    if not available then return nil end
    local ok, inv = pcall(function()
        return exports.ox_inventory:GetInventory(src)
    end)
    if ok and type(inv) == 'table' then return inv end
    return nil
end
