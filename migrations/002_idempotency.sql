-- ============================================================
-- RHODE GUARD ULTIMATE — Migration 002: économie v2.1 (oxmysql)
-- Journal d'opérations + idempotence persistante (§18/§27).
--
-- Appliquée automatiquement par l'adapter OxMySQL (CREATE IF NOT EXISTS).
-- Ce fichier reste la référence versionnée.
-- Rollback: DROP TABLE rhode_operations; DROP TABLE rhode_idempotency;
-- ============================================================

-- Journal des opérations économiques gardées par EconomyGuard.
-- Le client ne choisit AUCUNE transition d'état (§28).
CREATE TABLE IF NOT EXISTS rhode_operations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_at INTEGER NOT NULL,          -- epoch UTC
    license VARCHAR(80) NOT NULL,         -- license:hex de l'acteur
    op_type TEXT NOT NULL,                -- vente_ferme, salaire_miner, transfert...
    state TEXT NOT NULL,                  -- REQUESTED|VALIDATED|IN_PROGRESS|SUCCEEDED|REJECTED|FAILED|COMPENSATION_REQUIRED
    idem_key_digest VARCHAR(64),          -- empreinte de la clé d'idempotence
    payload_digest VARCHAR(64),           -- empreinte du contenu (détection de réutilisation frauduleuse)
    amount REAL,                          -- montant validé (calculé serveur)
    result_code TEXT                      -- code de rejet/échec stable
);

CREATE INDEX IF NOT EXISTS idx_rhode_ops_license ON rhode_operations (license);
CREATE INDEX IF NOT EXISTS idx_rhode_ops_created ON rhode_operations (created_at);
CREATE INDEX IF NOT EXISTS idx_rhode_ops_state ON rhode_operations (state);

-- Clés d'idempotence: une même clé + même contenu = un seul effet
-- (les retries réseau et double-clics ne créditent jamais deux fois).
-- TTL applicatif de 10 minutes (nettoyage côté ressource).
CREATE TABLE IF NOT EXISTS rhode_idempotency (
    scope VARCHAR(64) NOT NULL DEFAULT 'economy',
    operation_key_digest VARCHAR(64) NOT NULL,
    payload_digest VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,          -- état final de l'opération
    result_json LONGTEXT,                 -- résultat idempotent renvoyé au replay
    expires_at INTEGER NOT NULL,          -- epoch UTC
    PRIMARY KEY (scope, operation_key_digest)
);

CREATE INDEX IF NOT EXISTS idx_rhode_idem_expires ON rhode_idempotency (expires_at);
