--[[
    RHODE GUARD ULTIMATE — fxmanifest
    Anti-cheat défensif FiveM | ESX Legacy | ox_inventory | oxmysql
    Auteur: Rhode RP' +

    Ordre de chargement:
      1. shared/*   → protocole, schémas, configuration commune
      2. client/*   → signaux faibles + télémétrie (jamais une preuve seule)
      3. config/server.lua  → configuration serveur/panel
      4. server/services/* → guards et services (autorité)
      5. server/main.lua    → bootstrap, orchestration, exports

    Dépendances OPTIONNELLES (détection automatique, arrêt contrôlé si requises):
      - oxmysql (mode autonome sans panel)
      - es_extended (contexte économie)
      - ox_inventory (validation inventaire)
]]

fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'rhode_guard'
author 'Rhode RP\' +'
description 'RHODE GUARD ULTIMATE — anti-cheat défensif FiveM (mouvement, événements, combat, économie) + panel web'
version '2.4.0'

shared_scripts {
    'config/shared.lua',
    'shared/protocol.lua',
    'shared/operations.lua',
    'shared/schemas.lua',
    'shared/rulebook.lua',
}

client_scripts {
    'client/main.lua',
    'client/telemetry.lua',
}

server_scripts {
    'config/server.lua',
    'server/services/RateLimit.lua',
    'server/services/LockManager.lua',
    'server/services/PermissionService.lua',
    'server/services/EvidenceService.lua',
    'server/services/CaseService.lua',
    'server/services/BanService.lua',
    'server/services/EventGuard.lua',
    'server/services/MovementGuard.lua',
    'server/services/CombatGuard.lua',
    'server/services/VehicleGuard.lua',
    'server/services/EconomyGuard.lua',
    'server/services/InventoryGuard.lua',
    'server/services/Adapters/ESX.lua',
    'server/services/Adapters/OxInventory.lua',
    'server/services/Adapters/OxMySQL.lua',
    'server/main.lua',
}
