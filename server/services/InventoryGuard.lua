--[[
    RHODE GUARD ULTIMATE — InventoryGuard
    Validation des mouvements d'inventaire pour tes scripts (coffres, boutiques,
    transferts) — complémentaire d'ox_inventory dont les exports restent maîtres
    de l'état réel.

    Utilisation:
      local ok, reason = exports.rhode_guard:ValidateItemTransfer(source, 'coffre:ferme', 'player', 'iron', 12, idemKey)
      if not ok then return end
      -- puis appelle ox_inventory (RemoveItem/AddItem) en vérifiant leurs retours

    Vérifications:
      - quantité entière dans [1, 1000]
      - nom d'objet sain (pattern alphanumérique + _ -)
      - rythme par joueur (fenêtre glissante)
      - idempotence par clé (TTL 10 min)
      - si ox_inventory est présent: l'existence de l'objet et la quantité détenue
        sont revérifiées via ses exports (lecture seule)
]]

RHODE = RHODE or {}
RHODE.Inventory = RHODE.Inventory or {}

local itemPattern = '^[%w_%-]+$'
local idemKeys = {}

local function cfg()
    local detectors = (RHODE.Runtime and RHODE.Runtime.detectors) or Config.Modules
    return detectors.economy or Config.Modules.economy or {}
end

--- Valide un mouvement d'items avant application.
function RHODE.Inventory.ValidateTransfer(src, fromInv, toInv, item, count, idemKey)
    local c = cfg()
    count = tonumber(count)

    if type(item) ~= 'string' or not item:match(itemPattern) then
        return false, 'objet invalide'
    end
    if not count or count ~= count or math.floor(count) ~= count or count < 1 or count > 1000 then
        return false, 'quantité invalide'
    end
    if type(fromInv) ~= 'string' or type(toInv) ~= 'string' then
        return false, 'inventaires invalides'
    end

    -- Idempotence
    if idemKey and idemKey ~= '' then
        local now = os.time()
        for k, at in pairs(idemKeys) do
            if now - at > 600 then idemKeys[k] = nil end
        end
        if idemKeys[idemKey] then
            return false, 'mouvement déjà appliqué (idempotence)'
        end
        idemKeys[idemKey] = now
    end

    -- Rythme (réutilise le quota économie — même famille de risque)
    local ok = RHODE.RateLimit.Check(('player:%s:economy'):format(src), c.maxOpsPerMin or 10, 60)
    if not ok then
        return false, 'rythme excessif'
    end

    -- Recoupement ox_inventory (lecture seule, tolérant si absent)
    if RHODE.Adapters and RHODE.Adapters.OxInventory and RHODE.Adapters.OxInventory.Available() then
        local owned = RHODE.Adapters.OxInventory.GetItemCount(src, item)
        if owned ~= nil and fromInv == 'player' and owned < count then
            -- tentative de déplacer plus que possédé → signature de duplication
            local license = GetPlayerIdentifierByType(src, 'license')
            if license then
                RHODE.Evidence.Submit({
                    src = src, license = license, name = GetPlayerName(src) or '?',
                    module = 'economy', type = RHODE.TYPES.DUPLICATION,
                    severity = 'CRITICAL', confidence = 90,
                    source = RHODE.SOURCES.CROISEE,
                    facts = {
                        objet = item, demande = count, possede = owned,
                        de = fromInv, vers = toInv,
                    },
                    context = { note = 'recoupement ox_inventory: quantité détenue insuffisante' },
                })
            end
            return false, 'quantité possédée insuffisante'
        end
    end

    return true
end
