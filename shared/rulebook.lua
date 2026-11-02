--[[
    RHODE GUARD ULTIMATE — Rulebook (fiches de règles versionnées, §17/§29)
    Chaque détecteur possède une fiche: ID stable RG-<DOMAINE>-<NNN>, but,
    signaux, sources, faux positifs connus, coût, réaction par défaut.

    HONNÊTETÉ (§29): les règles dont la seule source est un signal client non
    corroboré sont marquées corroboration='client' — leur confiance est bornée
    et elles ne sanctionnent jamais seules (le panel sépare score et décision).

    Ce fichier est PUR (aucune native) → testable (tests/test_rulebook.lua).
]]

RHODE = RHODE or {}
RHODE.RULEBOOK_VERSION = '2.2.0'

RHODE.RULES = {
    -- ===== ÉVÉNEMENTS =====
    ['event_flood'] = {
        id = 'RG-EVT-001', module = 'anticheat', type = 'EVENT_FLOOD',
        titre = 'Rafale événementielle',
        but = 'Détecter un appel répété anormal des signalements/événements protégés.',
        signaux = { 'compteur de fenêtre glissante > quota/minute (serveur)' },
        sources = { 'SERVEUR' }, corroboration = 'serveur',
        fauxPositifs = { 'double-clic UI si quota très bas', 'script métier bavard non enregistré' },
        cout = 'très faible (compteur mémoire)', reaction = 'rejet + incident après seuil',
    },
    ['event_invalid'] = {
        id = 'RG-EVT-002', module = 'anticheat', type = 'EVENT_INVALID',
        titre = 'Paramètre hors schéma / token invalide',
        but = 'Rejeter payloads malformés (types, bornes, NaN, profondeur) et signaler les répétitions.',
        signaux = { 'validation RHODE.Validate en échec (serveur)', 'token tournant invalide' },
        sources = { 'SERVEUR' }, corroboration = 'serveur',
        fauxPositifs = { 'vrai bug d\'un script tiers mal typé' },
        cout = 'faible', reaction = 'rejet avant toute mutation + incident après seuil',
    },

    -- ===== ÉCONOMIE / INVENTAIRE =====
    ['economy_anomaly'] = {
        id = 'RG-ECO-001', module = 'economy', type = 'ECONOMY_ANOMALY',
        titre = 'Montant/quantité impossible ou rythme excessif',
        but = 'Refuser opérations hors bornes, hors catalogue ou trop fréquentes.',
        signaux = { 'montant hors ]0,max]', 'rythme > ops/min', 'refus répétés (serveur)' },
        sources = { 'SERVEUR' }, corroboration = 'serveur',
        fauxPositifs = { 'grosse vente légitime → ajuster maxAmountPerOp en AUDIT' },
        cout = 'très faible', reaction = 'rejet de l\'opération (jamais de modification de solde)',
    },
    ['duplication'] = {
        id = 'RG-ECO-002', module = 'economy', type = 'DUPLICATION',
        titre = 'Récompense/duplication répétée',
        but = 'Dédupliquer par clé d\'opération idempotente; détecter transfert > possédé.',
        signaux = { 'clé idempotente réutilisée', 'quantité demandée > possédée (recoupement ox_inventory)' },
        sources = { 'SERVEUR', 'CROISEE' }, corroboration = 'croisée',
        fauxPositifs = { 'latence d\'inventaire après un transfert rapide' },
        cout = 'faible (table idempotence + journal)', reaction = 'rejet idempotent + incident CRITICAL si contournement',
    },

    -- ===== MOUVEMENT =====
    ['teleport'] = {
        id = 'RG-MOV-001', module = 'teleport', type = 'TELEPORT',
        titre = 'Écart de déplacement répété',
        but = 'Détecter déplacements physiquement impossibles via mesures SERVEUR autoritaires.',
        signaux = { 'vitesse moyenne instantanée > seuil (fenêtre 750ms, serveur)' },
        sources = { 'SERVEUR' }, corroboration = 'serveur',
        fauxPositifs = { 'téléports script (garage/event) → AuthorizeTeleport', 'avions → grâce/seuil', 'ascenseurs/intérieurs → filtre Δz' },
        cout = 'moyen (échantillonnage par joueur)', reaction = 'strikes → dossier; rollback ENFORCE uniquement (borné 2 essais)',
    },
    ['telemetry'] = {
        id = 'RG-MOV-002', module = 'telemetry', type = 'TELEMETRY_MISMATCH',
        titre = 'Mouvement en état incompatible / télémétrie falsifiée',
        but = 'Comparer déclarations client et observations serveur (≥5 échantillons).',
        signaux = { 'écart position déclaré vs observé > tolérance' },
        sources = { 'CROISEE' }, corroboration = 'croisée',
        fauxPositifs = { 'latence extrême (tolérance 35%)' },
        cout = 'faible (lots déjà échantillonnés)', reaction = 'CRITICAL — client compromis probable, revue humaine',
    },
    ['speedhack'] = {
        id = 'RG-MOV-003', module = 'speedhack', type = 'SPEEDHACK',
        titre = 'Vitesse anormale répétée',
        but = 'Détecter vitesse à pied/nage/véhicule hors bornes (client + fenêtre serveur).',
        signaux = { 'vitesse instantanée client', 'vitesse moyenne fenêtre serveur' },
        sources = { 'CLIENT', 'SERVEUR' }, corroboration = 'les deux',
        fauxPositifs = { 'latence/streaming', 'véhicule moddé rapide → vehicleMargin' },
        cout = 'très faible', reaction = 'strikes → dossier',
    },
    ['fly'] = {
        id = 'RG-MOV-004', module = 'fly', type = 'FLY_NOCLIP',
        titre = 'Vol sans support',
        but = 'Temps en l\'air prolongé sans véhicule/parachute/échelle.',
        signaux = { 'airTime > minAirTime avec vz > -maxFallSpeed (client)' },
        sources = { 'CLIENT' }, corroboration = 'client (corroboré par télémétrie croisée)',
        fauxPositifs = { 'chute lente sur pente', 'mécaniques de vol moddées' },
        cout = 'très faible', reaction = 'strikes → dossier',
    },
    ['noclip'] = {
        id = 'RG-MOV-005', module = 'noclip', type = 'COLLISION_OFF',
        titre = 'Traversée de matière',
        but = 'Déplacement soutenu sans collision.',
        signaux = { 'noCollTime > minTime en mouvement (client)' },
        sources = { 'CLIENT' }, corroboration = 'client',
        fauxPositifs = { 'collision en chargement (déjà filtrée)', 'scripts de spectateur' },
        cout = 'très faible', reaction = 'strike → dossier',
    },
    ['superjump'] = {
        id = 'RG-MOV-006', module = 'superjump', type = 'SUPERJUMP',
        titre = 'Saut surréaliste',
        but = 'Vélocité verticale au décollage > plafond légitime.',
        signaux = { 'vz > maxJumpVelocity pendant IsPedJumping (client)' },
        sources = { 'CLIENT' }, corroboration = 'client',
        fauxPositifs = { 'trampolines/scripts de saut event' },
        cout = 'très faible', reaction = 'strikes → dossier',
    },
    ['godmode'] = {
        id = 'RG-MOV-007', module = 'godmode', type = 'GODMODE',
        titre = 'Invulnérabilité apparente',
        but = 'Invincibilité active hors contexte.',
        signaux = { 'GetPlayerInvincible prolongé (client)' },
        sources = { 'CLIENT' }, corroboration = 'client',
        fauxPositifs = { 'events staff (bypass ace)', 'scènes scriptées' },
        cout = 'très faible', reaction = 'strikes → dossier',
    },
    ['invisible'] = {
        id = 'RG-MOV-008', module = 'invisible', type = 'INVISIBLE',
        titre = 'Invisibilité',
        but = 'Entité invisible prolongée.',
        signaux = { 'IsEntityVisible = false soutenu (client)' },
        sources = { 'CLIENT' }, corroboration = 'client',
        fauxPositifs = { 'events staff (bypass ace)', 'scripts cinématiques' },
        cout = 'très faible', reaction = 'strike → dossier',
    },

    -- ===== COMBAT =====
    ['weapon_cadence'] = {
        id = 'RG-CMB-001', module = 'combat', type = 'WEAPON_CADENCE',
        titre = 'Cadence de kills incohérente',
        but = 'Kills fatals signalés par minute > plafond.',
        signaux = { 'compteur serveur des signaux fatals client' },
        sources = { 'SERVEUR' }, corroboration = 'serveur (sur données déclarées)',
        fauxPositifs = { 'event DM/military RP', 'armes moddées à haute cadence' },
        cout = 'faible', reaction = 'dossier MEDIUM — jamais de sanction seule',
    },
    ['blacklist_weapon'] = {
        id = 'RG-CMB-002', module = 'combat', type = 'BLACKLIST_WEAPON',
        titre = 'Arme interdite',
        but = 'Signalement d\'un modèle d\'arme figurant sur la blacklist configurée.',
        signaux = { 'hash d\'arme ∈ blacklist (client)' },
        sources = { 'CLIENT' }, corroboration = 'client',
        fauxPositifs = { 'mauvaise configuration de la blacklist' },
        cout = 'très faible', reaction = 'dossier HIGH',
    },
    ['one_hit_kill'] = {
        id = 'RG-CMB-003', module = 'combat', type = 'ONE_HIT_KILL',
        titre = 'Dégâts anormaux par coup',
        but = 'Dégâts signalés par coup > plafond (hors exceptions configurées).',
        signaux = { 'damage > maxDamagePerHit (client)' },
        sources = { 'CLIENT' }, corroboration = 'client',
        fauxPositifs = { 'explosions/écrasements → ajuster le seuil', 'armes lourdes moddées' },
        cout = 'faible', reaction = 'dossier HIGH après seuil de strikes',
    },

    ['aimbot'] = {
        id = 'RG-CMB-004', module = 'combat', type = 'AIMBOT',
        titre = 'Statistiques de visée anormales',
        but = 'Détecter un ratio de tirs à la tête + distance soutenus, humainement invraisemblables.',
        signaux = { 'ratio headshots ≥ seuil sur ≥ minShots coups (fenêtre serveur 5 min)', 'distance médiane > minDist' },
        sources = { 'SERVEUR' }, corroboration = 'serveur (sur données déclarées)',
        fauxPositifs = { 'sniper confirmé en garde-à-vous', 'event DM military RP' },
        cout = 'faible (compteurs mémoire)', reaction = 'dossier HIGH — revue humaine, jamais de sanction seule',
    },
    ['no_recoil'] = {
        id = 'RG-CMB-005', module = 'combat', type = 'NO_RECOIL',
        titre = 'Absence de recul',
        but = 'Détecter un recul de caméra quasi nul sur des rafales soutenues.',
        signaux = { 'variation de pitch ≈ 0 sur ≥ minBurst tirs rapprochés (client)' },
        sources = { 'CLIENT' }, corroboration = 'client',
        fauxPositifs = { 'armes à recul nul (pistolet à courte portée)', 'appuis/bipieds' },
        cout = 'très faible', reaction = 'dossier MEDIUM après seuil de strikes',
    },
    ['infinite_ammo'] = {
        id = 'RG-CMB-006', module = 'combat', type = 'INFINITE_AMMO',
        titre = 'Munitions infinies apparentes',
        but = 'Détecter des tirs prolongés sans recharge ni consommation de munitions.',
        signaux = { 'tirs ≥ minShots sans changement de chargeur signalé (client)' },
        sources = { 'CLIENT' }, corroboration = 'client',
        fauxPositifs = { 'chargeurs étendus moddés', 'armes à alimentation continue' },
        cout = 'très faible', reaction = 'dossier MEDIUM après seuil de strikes',
    },
    ['explosion_spam'] = {
        id = 'RG-CMB-007', module = 'combat', type = 'EXPLOSION_SPAM',
        but = 'Détecter des explosions déclenchées en rafale par un même joueur.',
        titre = 'Explosions en rafale',
        signaux = { 'explosions signalées > quota/minute (compteur serveur)' },
        sources = { 'SERVEUR' }, corroboration = 'serveur (sur événements réseau)',
        fauxPositifs = { 'event pyrotechnique scripté', 'chaîne de véhicules qui explosent' },
        cout = 'très faible', reaction = 'dossier HIGH après seuil de strikes',
    },

    -- ===== ENTITÉS / VÉHICULES =====
    ['vehicle_model'] = {
        id = 'RG-ENT-001', module = 'vehicle', type = 'VEHICLE_MODEL',
        titre = 'Modèle de véhicule interdit',
        but = 'Entrée en véhicule (conducteur) d\'un modèle blacklisté.',
        signaux = { 'hash modèle ∈ blacklist (client)' },
        sources = { 'CLIENT' }, corroboration = 'client',
        fauxPositifs = { 'véhicule event staff légitime → bypass ace' },
        cout = 'très faible', reaction = 'dossier HIGH',
    },
    ['vehicle_flood'] = {
        id = 'RG-ENT-002', module = 'vehicle', type = 'VEHICLE_FLOOD',
        titre = 'Spawn de véhicules en rafale',
        but = 'Véhicules DISTINCTS conduits par minute > quota.',
        signaux = { 'compteur serveur de modèles distincts signalés' },
        sources = { 'SERVEUR' }, corroboration = 'serveur (sur entrées déclarées)',
        fauxPositifs = { 'concession/garage en test', 'event course' },
        cout = 'faible', reaction = 'dossier MEDIUM',
    },

    -- ===== SYSTÈME =====
    ['system_alert'] = {
        id = 'RG-SYS-001', module = 'system', type = 'SYSTEM_ALERT',
        titre = 'File de preuves saturée / panne dépendance',
        but = 'Alerter les opérateurs quand la file bornée déborde (RG-SYS-001 §29).',
        signaux = { 'queue > QUEUE_MAX', 'panel/DB injoignable prolongé' },
        sources = { 'SERVEUR' }, corroboration = 'serveur',
        fauxPositifs = { 'coupure réseau brève' },
        cout = 'nul', reaction = 'alerte opérateur HIGH + mode dégradé documenté (jamais de perte silencieuse)',
    },
}

--- Fiche d'une règle par module (ou nil).
function RHODE.RuleFor(module)
    return RHODE.RULES[module]
end

--- Fiche par type de détection (recherche inverse).
function RHODE.RuleForType(dtype)
    for _, rule in pairs(RHODE.RULES) do
        if rule.type == dtype then return rule end
    end
    return nil
end

--- Contrôle d'intégrité du rulebook (utilisée par les tests):
--- IDs uniques, champs obligatoires présents, types connus du protocole.
function RHODE.RulebookCheck()
    local errors = {}
    local seenIds = {}
    for key, rule in pairs(RHODE.RULES) do
        if not rule.id then errors[#errors + 1] = key .. ': id manquant' end
        if seenIds[rule.id] then errors[#errors + 1] = rule.id .. ': ID dupliqué' end
        seenIds[rule.id] = true
        for _, field in ipairs({ 'module', 'type', 'titre', 'but', 'signaux', 'sources', 'fauxPositifs', 'reaction' }) do
            if rule[field] == nil then errors[#errors + 1] = key .. ': champ ' .. field .. ' manquant' end
        end
        if RHODE.TYPES and not RHODE.TYPES[string.upper(rule.type)] and rule.type ~= 'SYSTEM_ALERT' then
            errors[#errors + 1] = key .. ': type ' .. rule.type .. ' inconnu du protocole'
        end
    end
    return errors
end
