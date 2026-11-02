-- ============================================================
-- RHODE GUARD ULTIMATE — MODÈLE: boutique protégée de bout en bout (§27.1)
-- Ce fichier est un MODÈLE DOCUMENTÉ, volontairement NON chargé par fxmanifest.
-- Copie-le dans ta ressource métier et adapte le catalogue/les vérifications.
--
-- Ce qu'il démontre:
--   1. prix et catalogue CÔTÉ SERVEUR (le client n'envoie que itemId + qté)
--   2. clé d'idempotence → double-clic/retry sans double débit
--   3. verrous profil pendant l'application
--   4. journal d'opération (reprise après redémarrage)
--   5. échec partiel → op:Fail() + dossier, jamais de succès anticipé
-- ============================================================

local CATALOGUE = {
    ['kit_reparation']  = { prix = 250,  stock = 50 },
    ['jerrycan']        = { prix = 120,  stock = 100 },
    ['radio_pro']       = { prix = 850,  stock = 10 },
    -- ⚠ jamais d'objet ni de prix venant du client
}

-- enregistre l'événement protégé: schéma + rate-limit (EventGuard)
exports.rhode_guard:RegisterProtectedNetEvent('maboutique:acheter', {
    itemId = { type = 'string', required = true, maxLen = 48 },
    quantite = { type = 'number', required = true, min = 1, max = 10 },
    intentionId = { type = 'string', required = false, maxLen = 64 },
}, function(src, data)
    -- 1) résolution serveur
    local produit = CATALOGUE[data.itemId]
    if not produit then
        return -- rejet silencieux côté joueur (l'objet n'existe pas pour nous)
    end

    -- 2) état joueur (adapte à ton framework)
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    -- 3) clé d'idempotence stable par intention d'achat
    --    (le client fournit un uuid d'intention: même uuid = même achat)
    local idemKey = 'boutique:' .. tostring(data.intentionId or data.itemId)

    -- 4) opération gardée (bornes de montant vérifiées par EconomyGuard)
    local op = exports.rhode_guard:BeginEconomyOp(src, 'achat_boutique', {
        amount = produit.prix * data.quantite,
    }, idemKey)
    if not op then return end          -- motif journalisée par EconomyGuard
    if op.replay then
        -- retry/double-clic: renvoyer le résultat précédent, NE PAS recréditer
        TriggerClientEvent('maboutique:resultat', src, op.result)
        return
    end

    -- 5) application sous verrous du profil acheteur
    local ok = exports.rhode_guard:WithTransferLocks(src, src, function()
        -- solde (prix serveur)
        if xPlayer.getMoney() < produit.prix * data.quantite then
            op:Reject('solde_insuffisant')
            return false
        end
        -- stock & capacité (adapte: ox_inventory CanCarryItem)
        if (produit.stock or 0) < data.quantite then
            op:Reject('stock_epuise')
            return false
        end

        xPlayer.removeMoney(produit.prix * data.quantite)
        xPlayer.addInventoryItem(data.itemId, data.quantite) -- à adapter ox_inventory
        produit.stock = produit.stock - data.quantite
        return true
    end)

    if not ok then
        -- échec applicatif: le verrou est déjà libéré par WithLocks
        if op.state == 'REQUESTED' then op:Fail('verrou_contention') end
        return
    end

    -- 6) confirmation SEULEMENT après application réussie
    op:Succeed({ item = data.itemId, quantite = data.quantite })
    TriggerClientEvent('maboutique:resultat', src, {
        ok = true, item = data.itemId, quantite = data.quantite,
    })
end, { maxPerMin = 6 })
