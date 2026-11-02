-- ============================================================
-- RHODE GUARD ULTIMATE — Migration 001: mode autonome (oxmysql)
-- À exécuter UNIQUEMENT si tu utilises la ressource SANS panel web.
-- Avec le panel, la base de données de référence est celle du panel
-- (Prisma) — n'installe PAS ce schéma en parallèle pour les mêmes données.
--
-- Application automatique: l'adapter OxMySQL crée la table si absente
-- (CREATE TABLE IF NOT EXISTS). Ce fichier reste la référence versionnée.
--
-- Convention: temps en epoch secondes (INTEGER), JSON en TEXT,
-- requêtes toujours paramétrées (aucune concaténation de saisie).
-- Rollback: DROP TABLE rhode_incidents;
-- ============================================================

CREATE TABLE IF NOT EXISTS rhode_incidents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    incident_id VARCHAR(64) NOT NULL,      -- RG-<epoch>-<seq>-<rand>
    created_at INTEGER NOT NULL,           -- epoch UTC
    license VARCHAR(80) NOT NULL,          -- license:hex (identifiant principal)
    player_name TEXT,                      -- pseudo au moment de l'incident
    module VARCHAR(64) NOT NULL,           -- speedhack, teleport, economy...
    type VARCHAR(64) NOT NULL,             -- SPEEDHACK, TELEMETRY_MISMATCH...
    severity VARCHAR(16) NOT NULL,          -- LOW | MEDIUM | HIGH | CRITICAL
    confidence INTEGER NOT NULL DEFAULT 85,
    source TEXT NOT NULL DEFAULT 'SERVEUR',-- CLIENT | SERVEUR | CROISEE
    detector_version TEXT,
    mode TEXT,                             -- mode au moment de l'incident
    case_ref VARCHAR(64),                  -- référence de dossier locale
    facts TEXT,                            -- JSON minimisé (faits chiffrés)
    context TEXT,                          -- JSON contexte
    integrity TEXT                         -- empreinte joaat (limites documentées)
);

CREATE INDEX IF NOT EXISTS idx_rhode_incidents_license ON rhode_incidents (license);
CREATE INDEX IF NOT EXISTS idx_rhode_incidents_created ON rhode_incidents (created_at);
CREATE INDEX IF NOT EXISTS idx_rhode_incidents_case ON rhode_incidents (case_ref);

-- Réponse locale aux incidents (mode autonome) — décision humaine requise.
CREATE TABLE IF NOT EXISTS rhode_case_decisions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    case_ref VARCHAR(64) NOT NULL,
    decided_by VARCHAR(80) NOT NULL,       -- pseudo staff ou 'console'
    decision VARCHAR(32) NOT NULL,         -- FAUX_POSITIF | SANCTION | REJETE
    note TEXT,
    decided_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rhode_decisions_case ON rhode_case_decisions (case_ref);

-- Bans autonomes: identifiant de licence unique, durée explicite, levée réversible.
CREATE TABLE IF NOT EXISTS rhode_bans (
    license VARCHAR(80) NOT NULL PRIMARY KEY,
    reason VARCHAR(255) NOT NULL,
    case_ref VARCHAR(64) NULL,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    ban_count INTEGER NOT NULL DEFAULT 1,
    ban_level VARCHAR(100) NOT NULL DEFAULT 'ban temporaire'
);
