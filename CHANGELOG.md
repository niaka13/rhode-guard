## v2.4.0 — 2026-11-02 (paliers de sanction configurables)

### Ressource FiveM
- **Ajouté**: escalade persistante des bans confirmés : 24 h, 7 jours, 30 jours, puis permanent à la quatrième sanction.
- **Ajouté**: compteur et niveau conservés dans hode_bans; migration compatible avec les bans existants.
- **Renforcé**: le niveau suivant n'est choisi qu'après lecture de l'historique SQL; si cette lecture échoue, aucune sanction automatique n'est appliquée.
- **Sécurité**: les mêmes seuils de preuves serveur recoupées s'appliquent à chaque palier; les signaux client seuls restent exclus.
- **Corrigé**: retrait des identifiants de démonstration du guide du panel.

# Changelog — RHODE GUARD ULTIMATE

Format: changements réels uniquement, sans version promotionnelle fictive.

## v2.3.0 — 2026-11-02 (ban serveur persistant et preuves recoupées)

### Ressource FiveM
- **Ajouté**: table `rhode_bans`, contrôle du ban à la connexion, expiration de 7 jours,
  commande staff `rgunban` et trace console après écriture SQL.
- **Modifié**: un ban exige 4 preuves serveur allowlistées, au moins 2 types et 2
  familles de détection, plus une preuve critique ou des violations répétées de
  mouvement. Aucun signal client ou réponse de panel ne peut bannir seul.
- **Corrigé**: AIMBOT, EXPLOSION_SPAM et WEAPON_CADENCE utilisent maintenant la source
  CLIENT, car leurs données sont déclarées par le client.
- **Ajouté**: tests unitaires des règles de confiance et des seuils de ban.

## v2.2.0 — 2026-11-02 (itération « Combat avancé & appels de sanction »)

### Ressource FiveM
- **Ajouté**: 4 détecteurs combat — RG-CMB-004 AIMBOT (ratio headshots + distance
  moyenne sur fenêtre glissante serveur 5 min, ≥ aimMinShots coups, jamais de
  conclusion sur échantillon faible), RG-CMB-005 NO_RECOIL (variance de pitch
  caméra ≈ 0 sur rafale ≥ recoilMinBurst), RG-CMB-006 INFINITE_AMMO (tirs
  prolongés sans recharge signalée, 2 lots consécutifs), RG-CMB-007
  EXPLOSION_SPAM (explosions/min > quota, comptage serveur).
- **Ajouté**: client — collecte os touché (SKEL_Head), pitch caméra par tir,
  compteurs tirs/recharges/explosions agrégés dans le lot `rhode_guard:damage`
  (schéma étendu, champ `stats` validé par EventGuard).
- **Ajouté**: `RHODE.CombatGuard.AimStats()` — statistiques de visée PURES
  (testables hors FXServer, zéro division protégée).
- **Modifié**: config/shared.lua — seuils configurables par détecteur combat
  (aimMinShots, aimHeadshotRatio, aimMinDistance, recoilMinBurst,
  recoilMaxPitchVar, ammoMinShots, maxExplosionsPerMin).
- HONNÊTETÉ conservée: l'AIMBOT repose sur des statistiques DÉCLARÉES soutenues
  (un client peut se taire); sévérité HIGH → revue humaine, jamais de sanction
  automatique seule.

### Panel web
- **Ajouté**: système d'appels de sanction complet — modèle Appeal, formulaire
  PUBLIC sur l'écran de connexion (contester / suivre, sans compte staff),
  panneau « Appels de joueurs » dans SANCTIONS avec décision motivée
  (ACCEPTED lève la sanction + révocation tracée, REJECTED maintient),
  suivi public de statut par licence (réponse minimisée, aucune donnée staff).
- **Ajouté**: garde-fous appels — 1 seul appel par sanction, aucun nouvel appel
  après décision, rate-limit 5 soumissions/h/IP, plaidoirie ≥ 30 caractères,
  licence doit correspondre à un ban ACTIF, permissions VIEW_APPEALS /
  DECIDE_APPEALS (SUPPORT lecture seule), audit APPEAL_SUBMIT / APPEAL_ACCEPT /
  APPEAL_REJECT + webhooks appeal.submit/accepted/rejected.
- **Ajouté**: 4 types de détection au panel (labels FR, ingest, simulateur).

### Base de données
- **Ajouté (panel)**: table Appeal (banId, playerName, license, statement,
  contact, status, handledById, decisionNote, decidedAt) + relation Ban.appeals.

### Tests (exécutés)
- Lua pur: **62/62** (ajout de 11 tests combat: AimStats pur, AIMBOT seuils/
  distance, NO_RECOIL, INFINITE_AMMO double lot, EXPLOSION_SPAM, purge
  ClearPlayer, fiches rulebook, types protocole).
- API appels vérifiées bout en bout: soumission, refus doublon, validation
  minimale, suivi public, liste staff, RBAC (SUPPORT refusé en décision),
  décision REJECTED par MODERATOR avec audit.

— Rhode RP' +

## v2.0.0 — 2026-11-02

Refonte majeure sur la base de l'existant BASTION-AC v1 (panel + ressource Lua).
Conception originale, défensive uniquement, sans reprise de code ou de signatures
de produits tiers.

### Ressource FiveM (`rhode_guard`)
- **Ajouté**: architecture services (EventGuard, MovementGuard, CombatGuard,
  VehicleGuard, EconomyGuard, InventoryGuard, EvidenceService, CaseService,
  PermissionService, RateLimit) + adapters ESX / ox_inventory / oxmysql.
- **Ajouté**: vérification mouvement **serveur autoritaire** (positions, fenêtres
  glissantes, strikes avec décroissance, grâces: join/spawn/véhicule/intérieurs/
  téléports autorisés) + rollback de position borné (ENFORCE uniquement).
- **Ajouté**: **télémétrie croisée** client/serveur → détection des clients qui
  falsifient leurs rapports (TELEMETRY_MISMATCH, CRITICAL).
- **Ajouté**: EventGuard `RegisterProtectedNetEvent` (schéma + rate-limit) pour
  protéger les flux sensibles des gamemodes.
- **Ajouté**: EconomyGuard/InventoryGuard — bornes, rythme, **idempotence**,
  recoupement ox_inventory (détection de duplication).
- **Ajouté**: preuves minimisées avec empreinte d'intégrité (limites documentées),
  regroupement en dossiers, file bornée avec rejeu, stockage local oxmysql.
- **Ajouté**: synchronisation live des réglages panel (mode + kill-switch + seuils)
  toutes les 60 s; commandes staff /rgstatus /rgkick /rgmode (aces granulaires).
- **Modifié**: token joueur renforcé (rotation), watchdog de silence conservé,
  kick anti-spoof configurable, messages joueurs inchangés dans l'esprit.
- **Supprimé**: rien (migration propre depuis bastion_ac — renommer le dossier).

### Panel web
- **Ajouté**: dossiers d'incident (statuts, assignation, notes d'enquête, appels)
  avec regroupement automatique par joueur (fenêtre 60 min).
- **Ajouté**: mode global OBSERVATION / AUDIT / ENFORCE avec confirmation pour
  ENFORCE, kill-switch et seuils par détecteur, auto-sanction configurable,
  rétention réglable — tout audité.
- **Ajouté**: source des détections (client/serveur/croisée) + version détecteur
  + filtres associés; badge d'appel sur les bans; dossiers dans la fiche joueur;
  flux temps réel étendu aux dossiers.
- **Sécurité**: rate-limit login (8/10 min/IP), messages génériques, audit des
  échecs, permissions étendues (VIEW/MANAGE_CASES, VIEW/MANAGE_SETTINGS).
- **Renommé**: BASTION-AC → RHODE GUARD (cookies de session inclus).

### Base de données
- **Ajouté**: tables CaseFile, CaseNote, Setting; champs Detection.source,
  Detection.detectorVersion, Detection.caseId, Ban.appealStatus, Ban.caseId.
- **Ajouté**: migration oxmysql 001_init.sql (mode autonome).

### Tests et documentation
- **Ajouté**: 26 tests unitaires Lua pur (schémas, rate-limit, score) — 26/26 OK
  sur interpréteur Lua 5.4; contrôle de syntaxe 25/25 fichiers.
- **Ajouté**: docs/ (INSTALLATION, CONFIGURATION, PANEL, SECURITE, API) en français.
- **Non exécuté**: tests FXServer en préproduction et mesures de charge (p50/p95)
  — à réaliser avant tout passage en ENFORCE (voir docs/SECURITE.md §5).

— Rhode RP' +

## v2.1.0 — 2026-11-02 (itération « Gouvernance & flux bout en bout »)

### Gouvernance (panel)
- **Ajouté**: machine à états des dossiers (§28) — transitions validées côté serveur
  (OPEN → REVIEWING → ESCALATED → clôtures), motif OBLIGATOIRE pour escalade,
  clôture et réouverture, historique complet (CaseTransition: acteur, from→to,
  motif, UTC). Plus aucun changement de statut silencieux.
- **Ajouté**: workflow de révisions de configuration (§18/§19/§28) —
  BROUILLON → VALIDÉE → APPROUVÉE → ACTIVE avec diff feuille-à-feuille, checksum
  SHA-256, approbation séparée (l'auteur ne peut pas approuver, OWNER excepté),
  activation à confirmation renforcée, retour arrière motivé. Le kill-switch
  direct reste disponible en urgence ET produit une révision tracée isEmergency.
- **Ajouté**: rôle AUDITOR (§20) — lecture du journal d'audit et vues
  d'analyse, aucune mutation, aucun accès aux identifiants joueurs.
- **Ajouté**: GET /api/v1/health (§16.1/§19) — état non sensible pour opérateurs:
  santé panel/serveur, mode, règles actives, file, fraîcheur du heartbeat.
- **Ajouté**: bandeau santé par serveur sur le dashboard (état PRET/DÉGRADÉ/ARRÊT,
  file de preuves, fraîcheur).

### Ressource FiveM
- **Ajouté**: `shared/operations.lua` — machine d'états d'opérations économiques
  PURE (REQUESTED → … → SUCCEEDED/REJECTED/FAILED/COMPENSATION_REQUIRED) +
  idempotence (replay/conflit/TTL) — le client ne choisit aucune transition.
- **Ajouté**: EconomyGuard v2.1 sur ce socle — journal d'opérations et clés
  d'idempotence PERSISTÉS via oxmysql (migrations/002), RECHARGÉS au démarrage
  (un retry après redémarrage ne recrédite pas), exports BeginEconomyOp +
  WithTransferLocks.
- **Ajouté**: `server/services/LockManager.lua` — verrous par ordre déterministe
  (clés triées, anti-interblocage transferts croisés), ré-entrance par token,
  TTL 10 s, libération garantie même en erreur, métriques contended/expired.
  Correction d'un défaut réel trouvé par les tests: la ré-entrance ne libérait
  pas les tokens multiples (registre de tokens ajouté).
- **Ajouté**: `shared/rulebook.lua` — 18 fiches de règles RG-XXX-NNN versionnées
  (but, signaux, sources, faux positifs, coût, réaction); chaque preuve embarque
  ruleId + ruleVersion; RG-SYS-001 (file saturée/panne) émet une alerte opérateur
  différenciée, throttlée, sans identifiant.
- **Ajouté**: états de santé explicites INITIALISATION → PRET/DÉGRADÉ → ARRÊT,
  bootstrap avec contrôles (panel, oxmysql, reprise idempotence), heartbeat
  enrichi (state, queueSize, detectorsActive), arrêt propre tracé.
- **Modifié**: EvidenceService — ruleId/ruleVersion dans les preuves; alerte
  système RG-SYS-001 sur saturation de file (plus de perte silencieuse).
- **Ajouté**: docs/FLUX.md (séquences + invariants + scénarios de résilience
  §23), docs/RULEBOOK.md, docs/examples/shop_server.lua (modèle boutique §27.1,
  non chargé par le manifeste).

### Base de données
- **Ajouté (panel)**: tables CaseTransition, ConfigRevision; champs GameServer
  healthState/queueSize/detectorsActive.
- **Ajouté (jeu)**: migrations/002_idempotency.sql — rhode_operations (journal
  d'états) + rhode_idempotency (clés uniques scope+digest, TTL indexé).

### Tests (exécutés)
- Lua pur: **51/51** (ajout de 14 tests opérations/idempotence, 12 tests
  verrous/rulebook; correction du LockManager suite à un échec réel).
- Syntaxe Lua 5.4: **30/30** fichiers.
- TypeScript: machine à états dossiers **13/13** (module pur lib/case-machine.ts).
- Non exécuté: FXServer en préproduction (scénarios documentés dans FLUX.md),
  mesures de charge p50/p95/p99 (§10) — à réaliser avant ENFORCE.

— Rhode RP' +
