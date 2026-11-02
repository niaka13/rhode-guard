--[[
    RHODE GUARD ULTIMATE — Configuration serveur
    Les SECRETS (clé API) vont dans ce fichier, absent des dépôts publics.
    Ne mets JAMAIS de clé admin dans une ressource client — la clé ci-dessous ne
    circule qu'entre FXServer et le panel (en-tête X-API-Key, HTTPS recommandé).
]]

Config = Config or {}

-- ============ PANEL WEB ============
-- URL publique du panel avec suffixe /api/v1 — ex: "https://panel.mondomaine.com/api/v1"
-- Laisse vide ('') pour le MODE AUTONOME (stockage local oxmysql, sans panel).
Config.PanelURL = '' -- mode autonome tant qu'un panel HTTPS de production n'est pas prêt

-- Clé API générée dans le panel (SERVEURS → ton serveur → clé).
Config.ApiKey = ''

-- Sanctions automatiques en escalier, indépendantes du mode ENFORCE et invisibles au client.
-- L'escalade ne démarre qu'après confirmation par preuves serveur recoupées.
Config.AutoBan = {
    enabled = true,
    windowMinutes = 10,
    threshold = 4,
    minModules = 2,
    minTypes = 2,
    minConfidence = 85,
    repeatedTeleportThreshold = 4,
    repeatedSpeedThreshold = 6,
    levels = {
        { name = 'ban temporaire — première infraction confirmée', durationHours = 24 },
        { name = 'ban temporaire — récidive', durationHours = 168 },
        { name = 'ban temporaire — récidive répétée', durationHours = 720 },
        { name = 'ban permanent — récidives répétées', permanent = true },
    },
}

-- ============ CONNEXION ============
Config.BanCheckTimeout = 5000   -- ms max pour vérifier un ban à la connexion
Config.HeartbeatInterval = 60   -- s entre chaque heartbeat vers le panel
Config.ConfigSyncInterval = 60  -- s entre chaque synchronisation des réglages (kill-switch live)
Config.PanelHealthTimeout = 900 -- s sans réponse panel → considéré injoignable (file locale)

-- ============ LOGS ============
Config.Debug = false -- logs détaillés côté serveur (développement uniquement)

-- ============ NOTE DE SÉCURITÉ ============
-- En production: serve le panel en HTTPS devant (reverse proxy), restreins l'accès
-- à l'API v1 par pare-feu si possible, et fais tourner la clé API périodiquement
-- depuis le panel (SERVEURS → régénérer).
