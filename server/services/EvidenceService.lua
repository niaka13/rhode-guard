--[[
    RHODE GUARD ULTIMATE — EvidenceService
    Construit des preuves MINIMISÉES et vérifiables:
      - identifiants d'incident aléatoires, horodatage serveur (epoch UTC)
      - détecteur + version + configuration (seuils appliqués)
      - faits observés chiffrés (positions arrondies, vitesses, écarts)
      - contexte pertinent (véhicule, grâce active, source du signal)
      - décision et acteur

    Confidentialité: PAS de chat, pas de frappes, pas de capture d'écran obligatoire,
    pas de token, pas de dump mémoire. Les positions sont arrondies au mètre.

    Intégrité: chaque preuve porte une empreinte joaat (GetHashString) du payload
    canonique. HONNÊTETÉ: joaat est une empreinte 32 bits NON cryptographique — elle
    détecte une corruption accidentelle ou une retouche grossière, elle NE PROUVE PAS
    cryptographiquement l'authenticité face à un attaquant déterminé. Pour une garantie
    forte, il faudrait HMAC-SHA256 avec gestion de clés (rotation, coffre) — non inclus.
]]

RHODE = RHODE or {}
RHODE.Evidence = RHODE.Evidence or {}

local sequence = 0

--- Génère un identifiant d'incident local lisible: RG-<epoch>-<seq>-<rand>
local function nextIncidentId()
    sequence = sequence + 1
    if sequence > 9999 then sequence = 1 end
    return ('RG-%d-%04d-%04d'):format(os.time(), sequence, math.random(1000, 9999))
end

--- Sérialisation canonique stable (clés triées) pour l'empreinte.
local function canonical(t)
    if type(t) ~= 'table' then
        if type(t) == 'string' then return '"' .. t .. '"' end
        return tostring(t)
    end
    local keys = {}
    for k in pairs(t) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    local parts = {}
    for _, k in ipairs(keys) do
        parts[#parts + 1] = tostring(k) .. '=' .. canonical(t[k])
    end
    return '{' .. table.concat(parts, ';') .. '}'
end

--- Empreinte d'intégrité joaat du payload canonique (limites documentées en tête de fichier).
local function fingerprint(evidence)
    return ('%08x'):format(GetHashString(canonical(evidence)))
end

--- Construit une preuve minimisée pour une détection.
--- @param ctx table { src, license, name, module, source, severity, confidence, facts, context }
--- @return table evidence prête pour le panel
function RHODE.Evidence.Build(ctx)
    local detectors = (RHODE.Runtime and RHODE.Runtime.detectors) or {}
    local rule = RHODE.RuleFor and RHODE.RuleFor(ctx.module) or nil
    local evidence = {
        incidentId = nextIncidentId(),
        ts = os.time(),                 -- epoch UTC, formaté par le panel
        license = ctx.license,
        name = ctx.name,
        module = ctx.module,
        type = ctx.type or ctx.module,
        ruleId = rule and rule.id or nil, -- RG-XXX-NNN (rulebook §17/§29)
        ruleVersion = rule and RHODE.RULEBOOK_VERSION or nil,
        severity = ctx.severity,
        confidence = ctx.confidence or 85,
        source = ctx.source or RHODE.SOURCES.SERVEUR,
        detectorVersion = RHODE.VERSION,
        -- Seuils effectifs au moment de la détection (traçabilité de configuration)
        configApplied = detectors[ctx.module] or { enabled = true },
        mode = (RHODE.Runtime and RHODE.Runtime.mode) or 'AUDIT',
        -- Faits minimisés (déjà arrondis par les guards)
        facts = ctx.facts or {},
        -- Contexte pertinent
        context = ctx.context or {},
    }
    evidence.integrity = fingerprint(evidence)
    return evidence
end

--- Envoie une preuve au panel (ingest). Gère la réponse (autoBan en mode ENFORCE).
--- Si le panel est injoignable: mise en file bornée (flush ultérieur) + stockage
--- local oxmysql si disponible — jamais de perte silencieuse des incidents critiques.
function RHODE.Evidence.Submit(ctx, onResponse)
    local evidence = RHODE.Evidence.Build(ctx)

    -- Regroupement en dossier local (le panel fait aussi le sien)
    if RHODE.Case then
        evidence.caseRef = RHODE.Case.Attach(ctx.license, ctx.module)
    end

    -- La décision locale ne dépend jamais d'un signalement client ni du panel.
    if RHODE.Bans then RHODE.Bans.Observe(evidence) end

    if RHODE.Panel and RHODE.Panel.IsConfigured() then
        RHODE.Panel.Post('/ingest/detection', {
            license = evidence.license,
            name = evidence.name,
            type = evidence.type,
            severity = evidence.severity,
            confidence = evidence.confidence,
            source = evidence.source,
            detectorVersion = evidence.detectorVersion,
            details = {
                incidentId = evidence.incidentId,
                integrity = evidence.integrity,
                caseRef = evidence.caseRef,
                mode = evidence.mode,
                configApplied = evidence.configApplied,
                facts = evidence.facts,
                context = evidence.context,
            },
            evidenceHash = evidence.integrity,
        }, function(status, res)
            if status == 200 and res then
                if RHODE.Case then RHODE.Case.ConfirmRemote(evidence.license, res.caseRef) end
                if onResponse then onResponse(res, evidence) end
            else
                RHODE.Evidence.EnqueueLocal(evidence)
                if onResponse then onResponse(nil, evidence) end
            end
        end)
    else
        RHODE.Evidence.EnqueueLocal(evidence)
        if onResponse then onResponse(nil, evidence) end
    end

    -- Console serveur (log opérationnel)
    print(('^3[RHODE GUARD] 🚨 %s → %s (%s/%s, src=%s, dossier=%s)^0'):format(
        ctx.name, ctx.module, ctx.severity,
        RHODE.Round(ctx.confidence or 85) .. '%',
        evidence.source, evidence.caseRef or 'local'))
    return evidence
end

--[[ ============ FILE BORNÉE (panel injoignable) ============
    Backpressure: max 200 preuves en file. Au-delà, les plus anciennes NON critiques
    sont évacuées; les critiques passent en stockage local oxmysql si disponible. ]]
local queue = {}
local QUEUE_MAX = 200

function RHODE.Evidence.EnqueueLocal(evidence)
    queue[#queue + 1] = evidence
    if #queue > QUEUE_MAX then
        -- garde les incidents critiques en priorité
        local kept, dropped = {}, 0
        for i = #queue, 1, -1 do
            local e = queue[i]
            if e.severity == 'CRITICAL' or #kept < QUEUE_MAX then
                kept[#kept + 1] = e
            else
                dropped = dropped + 1
            end
        end
        queue = kept
        print(('^1[RHODE GUARD] file de preuves saturée: %d incidents non critiques évacués (backpressure)^0'):format(dropped))
        -- RG-SYS-001: alerte opérateur — jamais de perte silencieuse d'un incident critique
        RHODE.Evidence.SystemAlert('file de preuves saturée', {
            evacues = dropped,
            file = #queue,
            note = 'les incidents critiques sont conservés en priorité',
        })
    end
    -- stockage local immédiat si oxmysql disponible
    if RHODE.OxMySQL and RHODE.OxMySQL.Available() then
        RHODE.OxMySQL.StoreIncident(evidence)
    end
end

--- Rejoue la file vers le panel (appelé quand le relay redevient joignable).
function RHODE.Evidence.FlushQueue()
    if not RHODE.Panel or not RHODE.Panel.IsConfigured() then return #queue end
    local n = 0
    for i = 1, #queue do
        local e = queue[i]
        RHODE.Panel.Post('/ingest/detection', {
            license = e.license,
            name = e.name,
            type = e.type,
            severity = e.severity,
            confidence = e.confidence,
            source = e.source,
            detectorVersion = e.detectorVersion,
            details = { facts = e.facts, context = e.context, incidentId = e.incidentId, delayed = true },
        })
        n = n + 1
    end
    if n > 0 then
        print(('[RHODE GUARD] file de preuves rejouée: %d incident(s) transmis(s) au panel'):format(n))
        queue = {}
    end
    return 0
end

function RHODE.Evidence.QueueSize()
    return #queue
end

--[[ RG-SYS-001 — Alerte système opérateur (§22/§29): file saturée, panne dépendance.
    Différenciée des alertes comportement joueur; throttle 1/5 min; jamais d'identifiant. ]]
local lastSystemAlert = 0
function RHODE.Evidence.SystemAlert(subject, facts)
    if os.time() - lastSystemAlert < 300 then return end
    lastSystemAlert = os.time()
    print(('^1[RHODE GUARD] ⚠ [SYSTÈME] %s — voir panel (RG-SYS-001)^0'):format(subject))
    if RHODE.Panel and RHODE.Panel.IsConfigured() then
        RHODE.Panel.Post('/ingest/detection', {
            license = 'license:system',
            name = 'SYSTÈME',
            type = 'SYSTEM_ALERT',
            severity = 'HIGH',
            confidence = 99,
            source = 'SERVEUR',
            detectorVersion = RHODE.VERSION,
            details = { sujet = subject, faits = facts, operateur = true },
        })
    end
    -- stockage local autonome éventuel
    if RHODE.OxMySQL and RHODE.OxMySQL.Available() then
        RHODE.OxMySQL.StoreIncident({
            incidentId = ('RG-SYS-%d'):format(os.time()),
            ts = os.time(), license = 'license:system', name = 'SYSTÈME',
            module = 'system', type = 'SYSTEM_ALERT', severity = 'HIGH',
            confidence = 99, source = 'SERVEUR', detectorVersion = RHODE.VERSION,
            mode = (RHODE.Runtime and RHODE.Runtime.mode) or 'AUDIT',
            facts = facts, context = { sujet = subject }, integrity = 'n/a',
        })
    end
end

--- Trace une action staff manuelle vers le panel (audit côté panel).
function RHODE.Evidence.SendStaffAction(action, details)
    if RHODE.Panel and RHODE.Panel.IsConfigured() then
        RHODE.Panel.Post('/ingest/players', {
            event = 'staff_action',
            action = action,
            details = details,
        })
    end
end
