--[[
    RHODE GUARD ULTIMATE — Adapter oxmysql (mode autonome)
    Utilisé quand le panel web est absent/injoignable: les incidents sont stockés
    localement via oxmysql (exports, requêtes 100% paramétrées — migrations/001_init.sql).

    File d'attente bornée + écritures asynchrones: une panne MySQL ne bloque
    JAMAIS le tick de jeu; les incidents critiques sont prioritaires.
]]

RHODE = RHODE or {}
RHODE.Adapters = RHODE.Adapters or {}
RHODE.Adapters.OxMySQL = RHODE.OxMySQL or {}
RHODE.OxMySQL = RHODE.Adapters.OxMySQL

local available = false
local bansReady = false
local pendingWrites = 0

local function migrationFailed(step, queryError)
    if not queryError then return false end
    print(('^1[RHODE GUARD] requête SQL échouée à l’étape %s; vérifier le schéma et la connexion^0')
        :format(step))
    return true
end

CreateThread(function()
    for _ = 1, 30 do
        if GetResourceState('oxmysql') == 'started' then
            available = true
            break
        end
        Wait(1000)
    end
    if available then
        -- auto-migration si la table manque (idempotent: CREATE TABLE IF NOT EXISTS)
        MySQL.query([[
            CREATE TABLE IF NOT EXISTS rhode_incidents (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                incident_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                license TEXT NOT NULL,
                player_name TEXT,
                module TEXT NOT NULL,
                type TEXT NOT NULL,
                severity TEXT NOT NULL,
                confidence INTEGER NOT NULL DEFAULT 85,
                source TEXT NOT NULL DEFAULT 'SERVEUR',
                detector_version TEXT,
                mode TEXT,
                case_ref TEXT,
                facts TEXT,
                context TEXT,
                integrity TEXT
            )
        ]], nil, function(_, queryError)
            if migrationFailed('création incidents', queryError) then return end
            MySQL.query([[
                CREATE TABLE IF NOT EXISTS rhode_bans (
                    license VARCHAR(80) NOT NULL PRIMARY KEY,
                    reason VARCHAR(255) NOT NULL,
                    case_ref VARCHAR(64) NULL,
                    issued_at INTEGER NOT NULL,
                    expires_at INTEGER NULL,
                    active TINYINT(1) NOT NULL DEFAULT 1,
                    ban_count INTEGER NOT NULL DEFAULT 1,
                    ban_level VARCHAR(100) NOT NULL DEFAULT 'ban temporaire'
                )
            ]], nil, function(_, queryError)
                if migrationFailed('création sanctions', queryError) then return end
                MySQL.query('ALTER TABLE rhode_bans ADD COLUMN IF NOT EXISTS ban_count INTEGER NOT NULL DEFAULT 1', nil, function(_, queryError)
                    if migrationFailed('ajout compteur sanctions', queryError) then return end
                    MySQL.query("ALTER TABLE rhode_bans ADD COLUMN IF NOT EXISTS ban_level VARCHAR(100) NOT NULL DEFAULT 'ban temporaire'", nil, function(_, queryError)
                        if migrationFailed('ajout niveau sanction', queryError) then return end
                        -- Les anciennes lignes actives correspondent au moins à une sanction.
                        MySQL.query('UPDATE rhode_bans SET ban_count = 1 WHERE active = 1 AND ban_count < 1', nil, function(_, queryError)
                            if migrationFailed('normalisation compteurs sanctions', queryError) then return end
                            bansReady = true
                            print('^2[RHODE GUARD] mode autonome oxmysql prêt (incidents + bans persistants et niveaux)^0')
                        end)
                    end)
                end)
            end)
        end)
    else
        print('[RHODE GUARD] oxmysql absent — stockage local désactivé (panel requis)')
    end
end)

function RHODE.OxMySQL.Available()
    return available
end

--- Vérifie un ban local actif. Le rappel reçoit (ban, prêt) pour distinguer
--- une absence de sanction d'un stockage qui n'a pas fini de démarrer.
function RHODE.OxMySQL.CheckActiveBan(license, cb)
    if not available or not bansReady then
        if cb then cb(nil, false) end
        return
    end
    MySQL.query(
        'SELECT reason, case_ref, expires_at FROM rhode_bans WHERE license = ? AND active = 1 AND (expires_at IS NULL OR expires_at = 0 OR expires_at > ?) LIMIT 1',
        { license, os.time() },
        function(rows, queryError)
            local ban = rows and rows[1] or nil
            if cb then cb(ban, not queryError and rows ~= nil) end
        end
    )
end

--- Renvoie le nombre de sanctions antérieures; indispensable à l'escalade.
function RHODE.OxMySQL.GetBanCount(license, cb)
    if not available or not bansReady then
        if cb then cb(0, false) end
        return
    end
    MySQL.query(
        'SELECT ban_count FROM rhode_bans WHERE license = ? LIMIT 1',
        { license },
        function(rows, queryError)
            local count = rows and rows[1] and tonumber(rows[1].ban_count) or 0
            if cb then cb(count, not queryError and rows ~= nil) end
        end
    )
end

--- Enregistre ou renouvelle le ban actif d'une licence avant toute expulsion.
function RHODE.OxMySQL.IssueBan(ban, cb)
    if not available or not bansReady then
        if cb then cb(false) end
        return
    end
    MySQL.query([[
        INSERT INTO rhode_bans (license, reason, case_ref, issued_at, expires_at, active, ban_count, ban_level)
        VALUES (?, ?, ?, ?, ?, 1, 1, ?)
        ON DUPLICATE KEY UPDATE reason = VALUES(reason), case_ref = VALUES(case_ref),
            issued_at = VALUES(issued_at), expires_at = VALUES(expires_at), active = 1,
            ban_count = ban_count + 1, ban_level = VALUES(ban_level)
    ]], {
        ban.license, ban.reason, ban.caseRef, ban.issuedAt,
        -- 0 représente un ban permanent (également accepté par CheckActiveBan).
        -- Éviter nil au milieu du tableau Lua : oxmysql peut le sérialiser comme un trou.
        ban.expiresAt ~= 0 and ban.expiresAt or 0,
        ban.level or 'ban temporaire',
    }, function(result, queryError)
        if cb then cb(not queryError and result ~= nil) end
    end)
end

--- Lève un ban actif en conservant la ligne d'audit.
function RHODE.OxMySQL.RevokeBan(license, cb)
    if not available or not bansReady then
        if cb then cb(false) end
        return
    end
    MySQL.query(
        'UPDATE rhode_bans SET active = 0 WHERE license = ? AND active = 1',
        { license },
        function(result, queryError)
            if cb then cb(not queryError and result ~= nil) end
        end
    )
end

--- Stocke un incident localement (asynchrone, requêtes paramétrées uniquement).
function RHODE.OxMySQL.StoreIncident(evidence)
    if not available then return false end
    if pendingWrites > 100 then
        -- backpressure: on ne laisse pas s'accumuler
        return false
    end
    pendingWrites = pendingWrites + 1
    MySQL.query(
        'INSERT INTO rhode_incidents (incident_id, created_at, license, player_name, module, type, severity, confidence, source, detector_version, mode, case_ref, facts, context, integrity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        {
            evidence.incidentId,
            evidence.ts,
            evidence.license,
            evidence.name,
            evidence.module,
            evidence.type,
            evidence.severity,
            evidence.confidence,
            evidence.source,
            evidence.detectorVersion,
            evidence.mode,
            evidence.caseRef,
            json.encode(evidence.facts or {}),
            json.encode(evidence.context or {}),
            evidence.integrity,
        },
        function(_, queryError)
            pendingWrites = pendingWrites - 1
            if queryError then
                print('^1[RHODE GUARD] incident non enregistré en base (échec SQL)^0')
            end
        end
    )
    return true
end

--- Derniers incidents locaux (lecture, utile en mode autonome).
function RHODE.OxMySQL.RecentIncidents(limit, cb)
    if not available then
        if cb then cb({}) end
        return
    end
    limit = math.min(math.max(tonumber(limit) or 20, 1), 100)
    MySQL.query(
        'SELECT * FROM rhode_incidents ORDER BY created_at DESC LIMIT ?',
        { limit },
        function(rows)
            if cb then cb(rows or {}) end
        end
    )
end

--[[ ============ ÉCONOMIE v2.1: journal d'opérations + idempotence (§18/§27) ============
    Tables créées par migrations/002_idempotency.sql (et à la volée ci-dessous,
    idempotent). Écritures ASYNCHRONES uniquement — jamais dans le chemin critique. ]]

function RHODE.OxMySQL.EnsureEconomyTables(cb)
    if not available then
        if cb then cb(false, 'oxmysql indisponible') end
        return
    end
    MySQL.query([[
        CREATE TABLE IF NOT EXISTS rhode_operations (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            license VARCHAR(80) NOT NULL,
            op_type TEXT NOT NULL,
            state TEXT NOT NULL,
            idem_key_digest VARCHAR(64),
            payload_digest VARCHAR(64),
            amount REAL,
            result_code TEXT
        )
    ]], nil, function(_, queryError)
        if migrationFailed('création journal économique', queryError) then
            if cb then cb(false, 'création du journal économique échouée') end
            return
        end
        MySQL.query([[
            CREATE TABLE IF NOT EXISTS rhode_idempotency (
                scope VARCHAR(64) NOT NULL,
                operation_key_digest VARCHAR(64) NOT NULL,
                payload_digest VARCHAR(64) NOT NULL,
                status VARCHAR(32) NOT NULL,
                result_json LONGTEXT,
                expires_at INTEGER NOT NULL,
                PRIMARY KEY (scope, operation_key_digest)
            )
        ]], nil, function(_, queryError)
            if migrationFailed('création idempotence économique', queryError) then
                if cb then cb(false, 'création idempotence échouée') end
                return
            end
            print('^2[RHODE GUARD] économie: tables idempotence/journal vérifiées^0')
            if cb then cb(true) end
        end)
    end)
end

--- Journalise une opération (asynchrone, best-effort, requêtes paramétrées).
function RHODE.OxMySQL.StoreOperation(op)
    if not available then return false end
    MySQL.query(
        'INSERT INTO rhode_operations (created_at, license, op_type, state, idem_key_digest, payload_digest, amount, result_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        {
            os.time(), op.license or '', op.opType or '', op.state or '',
            op.idemKey or '', op.payloadDigest or '', op.amount or nil, op.resultCode or nil,
        }
    )
    -- persiste l'idempotence pour la reprise après redémarrage
    if op.idemKey and op.idemKey ~= '' then
        MySQL.query(
            'INSERT INTO rhode_idempotency (scope, operation_key_digest, payload_digest, status, result_json, expires_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), result_json = VALUES(result_json), expires_at = VALUES(expires_at)',
            {
                'economy', op.idemKey, op.payloadDigest or '', op.state,
                op.result and json.encode(op.result) or nil,
                os.time() + 600,
            }
        )
    end
    return true
end

--- Recharge les clés d'idempotence actives (appelé au démarrage de la ressource).
function RHODE.OxMySQL.LoadActiveIdempotency(cb)
    if not available then
        if cb then cb({}) end
        return
    end
    MySQL.query(
        'SELECT operation_key_digest, payload_digest, status, result_json, expires_at FROM rhode_idempotency WHERE expires_at > ?',
        { os.time() },
        function(rows, queryError)
            if queryError then
                print('^1[RHODE GUARD] clés d’idempotence non rechargées (échec SQL)^0')
                if cb then cb({}, false) end
                return
            end
            if cb then cb(rows or {}, rows ~= nil) end
        end
    )
end
