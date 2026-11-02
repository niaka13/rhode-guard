# RHODE GUARD ULTIMATE — Sécurité, confidentialité et limites

## 1. Modèle de menace (extrait de la matrice complète)

| Menace | Précondition | Contrôle principal | Faux positifs possibles | Test sûr |
|---|---|---|---|---|
| Appel direct/répété d'événements réseau | client modifié | EventGuard: schéma + rate-limit + strikes | rafale légitime (double-clic UI) → quota 10-30/min | script de test qui appelle l'événement protégé en boucle |
| Payload malformé (types, NaN, ∞, profondeur) | client modifié | RHODE.Validate (types, bornes, tailles, cycles) | — | tests/test_schemas.lua (26 cas) |
| Montant/récompense forgés | script métier trop confiant | EconomyGuard: bornes + idempotence (le client ne fournit JAMAIS le montant final) | grosse vente légitime → ajuster maxAmountPerOp | double-appel de `ValidateEconomyOp` avec la même clé |
| Duplication (transferts concurrents) | race client/serveur | idempotence + recoupement ox_inventory (quantité détenue) | latence d'inventaire → vérifier le dossier | transfert de plus que possédé (compte de test) |
| Téléport/speedhack | cheat moteur | **vérification SERVEUR** (positions autoritaires, fenêtres, strikes) | téléports script (garage/event) → `AuthorizeTeleport`; avions → grâce/seuil | se téléporter via admin menu en PRÉPRODUCTION sans autorisation |
| Fly/noclip/superjump/godmode/invisible | cheat moteur | signaux client + corroboration serveur + watchdog | events staff (bypass ace), lag de collision | activer brièvement en préproduction, vérifier le dossier |
| Client menteur (télémétrie falsifiée) | client compromis | **TELEMETRY_MISMATCH**: comparaison client/serveur sur ≥5 échantillons | latence extrême (tolérance 35%) | — |
| AC neutralisé côté client | injection/intrusion | watchdog de silence (300 s) + token tournant | crash du client | couper la ressource client sur un compte de test |
| Flood de signalements | client modifié | quota 12/min → EVENT_FLOOD | — | tests/test_ratelimit.lua |
| Compte staff compromis | phishing/réutilisation de mdp | RBAC moindre privilège, audit complet, rate-limit login, révocation par désactivation | — | vérifier l'audit après chaque action de test |
| Panne panel/DB | opérationnel | file bornée (200, critiques prioritaires) + rejeu + stockage local oxmysql | — | couper le panel 10 min, vérifier le rejeu |
| Compromission de la clé API | fuite config | clé régénérable, ne circule que FXServer↔panel, HTTPS recommandé | — | — |

## 2. Preuves — minimisation et intégrité

**Collecté** (et rien d'autre): identifiant d'incident aléatoire, horodatage epoch,
license + pseudo, module/type/sévérité/confiance, **source** (client/serveur/croisée),
version détecteur + **seuils appliqués**, faits chiffrés arrondis (positions au mètre,
vitesses), contexte (véhicule, grâce, dossier), empreinte d'intégrité.

**Jamais collecté**: chat, frappes, écran, fichiers du joueur, tokens, dumps.
Pas de capture d'écran exigée comme preuve; pas d'enregistrement caché.

**Intégrité**: chaque preuve porte une empreinte **joaat** du payload canonique.
⚠️ **Limite explicite**: joaat est 32 bits, non cryptographique — elle détecte une
corruption accidentelle, pas un attaquant déterminé. Une garantie forte exigerait
HMAC-SHA256 avec rotation de clés (non inclus, documenté).

**Rétention** (panel RÉGLAGES): faux positifs 90 j · bans/dossiers 365 j · audit
180 j · purge automatique. Les accès sensibles sont journalisés.

## 3. Ce que RHODE GUARD NE fait PAS

- Aucun scan de machine, injecteur, exécuteur Lua, accès aux fichiers du joueur.
- Aucune commande distante arbitraire: uniquement des **exports nommés, bornés,
  audités** (AuthorizeTeleport, validations, enregistrements).
- Le ban local exige plusieurs preuves serveur allowlistées, issues d'au moins
  deux catégories; les preuves client, les signaux de combat déclarés, les véhicules
  et les erreurs de token sont exclus. Un incident isolé ne bannit pas.
- `rgunban license:...` permet au staff ACE autorisé de lever un ban local. Les bans
  autonomes sont conservés dans `rhode_bans` et suivent une escalade configurable (24 h, 7 jours, 30 jours, puis permanent à la quatrième sanction confirmée).
- Aucune prétention d'invisibilité ou d'infaillibilité.
- Aucune copie de signatures/interfaces de produits tiers.

## 4. Limites connues (à lire avant ENFORCE)

| Limite | Impact | Atténuation |
|---|---|---|
| Les dégâts/tirs ne sont pas visibles côté serveur | cheat de visée discret non détecté | CombatGuard détecte les excès déclarés; compléter par des ressources dédiées si besoin |
| xPlayer.addMoney ne peut pas être intercepté sans coopération | les scripts métier non protégés restent exposés | faire passer tes flux par `ValidateEconomyOp` (migration progressive) |
| Avions/hélicos rapides | téléports légitimes peuvent être signalés | `AuthorizeTeleport`, seuil maxSpeedMs, mode AUDIT d'abord |
| Position serveur = entité répliquée | un lag peut fausser UN échantillon | fenêtres + strikes, jamais de décision isolée |
| Rollback de position | cas rare de piégeage | borné (1/10 s, 2 tentatives), jamais pendant grâce, journalisé |
| fail-open au ban check si panel injoignable | un joueur banni peut entrer | cache local + bascule fail-closed possible (config), reconnexion panel |
| Le panel doit être en HTTPS | sinon clé API en clair | reverse proxy TLS obligatoire en production |

## 5. Validation — ce qui a été testé et comment

| Niveau | Statut | Détail |
|---|---|---|
| Statique (syntaxe Lua) | ✅ exécuté | 35/35 fichiers analysés avec luaparser sans erreur |
| Unitaire (Lua pur) | ✅ exécuté | **74/74**: schémas, rate-limit, score, opérations/idempotence, verrous, rulebook, combat, niveaux de ban, expiration des preuves et révocation ACE — aucune native FXServer n’est exécutée par ces tests |
| Unitaire (TypeScript, module pur) | ✅ exécuté | 13/13: machine à états des dossiers (transitions permises/refusées, motifs requis, refus par défaut) |
| Intégration (API panel) | ✅ exécuté | ingest v2 (dossier auto, mode), config live, bans/check, **health, workflow de révision (draft→validate→approve→activate→rollback), transitions motivées (409/400 attendus)** — sur l'environnement de démonstration |
| E2E navigateur | ✅ exécuté | connexion, dossiers (transition motivée + historique), réglages (kill-switch propagé < 60 s vérifié via /api/v1/config), responsive mobile, 0 erreur console |
| FXServer (préproduction) | ❌ non exécuté | à faire: 2 clients de test, scénarios §1 + FLUX.md (double-clic, retry, redémarrage, transferts croisés, panne DB) |
| Charge / p50-p95-p99 | ❌ non mesuré | à mesurer avec population représentative avant ENFORCE (protocole §10) |

## 6. Procédures

**Incident (faux positif massif)**: RÉGLAGES → basculer le détecteur concerné en
désactivé (ou mode OBSERVATION) → effet < 60 s → marquer les faux positifs →
réétalonner → réactiver en AUDIT.

**Rotation de clé API**: SERVEURS → régénérer → mettre à jour `config/server.lua`
→ `restart rhode_guard` (fenêtre de quelques secondes).

**Compte staff compromis**: STAFF → désactiver (les sessions actives deviennent
invalides) → auditer ses actions → changer les mots de passe.
