# RHODE GUARD ULTIMATE v2.4.0

**Anti-cheat défensif pour FiveM** — ESX Legacy · ox_inventory · oxmysql
Auteur: **Rhode RP' +** · Licence: usage serveur, projet défensif uniquement

> ⚠️ **Posture honnête**: aucun anti-cheat n'est infaillible. RHODE GUARD réduit les
> abus, rend les incidents compréhensibles et protège l'économie — il ne remplace
> ni un administrateur attentif, ni des dépendances à jour, ni l'escrow FiveM.

---

## Les 3 composants

| Composant | Rôle | Emplacement |
|---|---|---|
| **Ressource FiveM** | Guards serveur autoritaires (mouvement, événements, combat, véhicules, économie), télémétrie croisée, opérations économiques idempotentes, preuves minimisées | ce dossier (`resources/rhode_guard`) |
| **Panel web** | Composant prévu dans l’architecture; cette interface n’est pas fournie dans ce dépôt ni déployée | indisponible pour l’instant |
| **Base de données** | Panel: Prisma (référence). Mode autonome: oxmysql (`migrations/`) | — |

> **État réel du panel (2 novembre 2026)** : la ressource FiveM fonctionne en mode autonome oxmysql. `Config.PanelURL` et `Config.ApiKey` sont vides. Il n’existe donc pas d’adresse web à ouvrir pour RHODE Guard et aucun événement ne part vers un dashboard. `docs/PANEL.md` décrit la cible fonctionnelle, pas une interface installée.

## Démarrage rapide

1. **Panel (à réaliser)** : déployer une application web de production sécurisée,
   créer un compte OWNER, enregistrer le serveur puis produire une clé API dédiée.
   Cette étape n’est pas faite; ne renseigne pas d’URL ou de clé fictive.
2. **Ressource**: déposer ce dossier dans `resources/rhode_guard`, renseigner
   `config/server.lua` (URL panel + clé API).
3. **server.cfg**:
   ```cfg
   ensure oxmysql      # optionnel (mode autonome)
   ensure es_extended  # optionnel (contexte ESX)
   ensure ox_inventory # optionnel (recoupement inventaire)
   ensure rhode_guard

   add_ace group.admin rhode.bypass allow
   add_ace group.admin rhode.staff  allow
   add_ace group.admin rhode.kick   allow
   ```
4. Le mode de détection démarre en OBSERVATION. Le ban local est indépendant des
   actions ENFORCE : il exige au moins 4 preuves serveur allowlistées, 2 catégories
   distinctes, et une preuve critique ou des violations de mouvement répétées.
   Il enregistre le ban dans `rhode_bans` avant d'expulser le joueur; durée par
   paliers configurables : 24 h, 7 jours, 30 jours, puis ban permanent à la quatrième sanction confirmée. Les preuves s'accumulent sur la fenêtre réelle configurée (10 minutes par défaut), même après une reconnexion, puis expirent. Les signaux client seuls ne bannissent jamais.

Guide détaillé: [`docs/INSTALLATION.md`](docs/INSTALLATION.md) ·
Flux métier de bout en bout: [`docs/FLUX.md`](docs/FLUX.md)

## Architecture v2.1

```
client (signaux faibles)          serveur (AUTORITÉ)                     panel (décision/revue)
┌────────────────────┐   token   ┌────────────────────────────┐   API   ┌──────────────────────┐
│ mouvement/dégâts   │ ────────▶ │ EventGuard (schéma+rl)      │ ──────▶ │ ingest v2            │
│ télémétrie (lots)  │           │ MovementGuard (positions)   │        │ dossier auto +       │
└────────────────────┘           │ Combat/VehicleGuard         │ ◀───── │ machine à états      │
                                 │ EconomyGuard ──▶ RHODE.OPS  │  API   │ (transitions motivées)│
                                 │  └ idempotence persistante  │        │ révisions de config  │
GetEntityCoords (serveur) ─────▶ │ LockManager (ordre trié)    │        │ santé + RG-SYS-001   │
                                 │ EvidenceService (ruleId)    │        │ sanctions (ENFORCE)  │
                                 │ CaseService                 │        └──────────────────────┘
                                 └────────────────────────────┘
États de santé: INITIALISATION → PRET | DEGRADE → ARRET (§16.1)
```

## Modes de réponse

| Mode | Journalise | Dossiers + alertes | Rollback position | Kick auto | Sanction auto |
|---|:-:|:-:|:-:|:-:|:-:|
| OBSERVATION | ✓ | — | — | — | ban local après seuil de preuves serveur recoupées |
| AUDIT | ✓ | ✓ | — | — | — |
| ENFORCE | ✓ | ✓ | ✓ (borné) | jamais sur signal client | ban local selon preuves recoupées |

Le staff peut lever un ban avec `rgunban license:...`; la permission ACE
`rhode.staff` est exigée depuis le jeu. `oxmysql` doit tourner pour conserver et
vérifier les bans après redémarrage.

Changement de mode et de seuils : **workflow de révision** (brouillon → validation →
approbation séparée → activation confirmée) ou chemin d'urgence tracé (kill-switch).

## Exports pour ton gamemode

```lua
exports.rhode_guard:AuthorizeTeleport(source, "garage")
exports.rhode_guard:RegisterProtectedNetEvent('monjob:pay', { amount = 'number' }, handler, { maxPerMin = 5 })
local op = exports.rhode_guard:BeginEconomyOp(source, 'vente_ferme', { amount = 1250 }, idemKey)
-- op:Succeed(result) / op:Reject(reason) / op:Fail(reason) / op.replay
exports.rhode_guard:WithTransferLocks(fromSrc, toSrc, fn)
exports.rhode_guard:ValidateEconomyOp(source, montant, motif, idemKey)  -- API v2.0
exports.rhode_guard:ValidateItemTransfer(source, fromInv, toInv, item, count, idemKey)
exports.rhode_guard:RegisterServerVehicle(netId, source)
exports.rhode_guard:GetStatus()  -- état, mode, file, verrous, détecteurs actifs
```

Modèle complet boutique: `docs/examples/shop_server.lua` (documenté, non chargé).

## Tests

```bash
lua54 tests/run_tests.lua   # 76 tests: schémas, rate-limit, score, opérations, verrous, rulebook, combat, bans, permissions
```
Vérifié localement le 2 novembre 2026: 76/76 OK (Lua 5.5 via Lupa) · syntaxe 36/36 ·
machine à états dossiers 13/13 (TypeScript). Les natives FiveM nécessitent une
préproduction — scénarios dans `docs/FLUX.md` et `docs/SECURITE.md`.

## Carte de complétion (§34 — état réel, sans mot « terminé » global)

| Composant | Conçu | Implémenté | Vérifié statiquement | Testé local | Testé préprod | Validé live |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Guards mouvement/événements/combat/véhicules (Lua) | ✓ | ✓ | ✓ (syntaxe 36/36) | partiel (tests unitaires Lua pur — 76 tests) | ✗ | ✗ |
| Économie: idempotence, verrous, journal (Lua) | ✓ | ✓ | ✓ | ✓ (14 tests invariants) | ✗ (scénarios FLUX.md à rejouer) | ✗ |
| Rulebook + preuves minimisées | ✓ | ✓ | ✓ | ✓ (6 tests intégrité) | ✗ | ✗ |
| Panel: dashboard/santé/dossiers/sanctions | ✓ | ✓ | ✓ (lint 0) | ✓ E2E navigateur | ✗ | ✗ |
| Machine à états dossiers + révisions config | ✓ | ✓ | ✓ | ✓ (13 tests TS + E2E) | ✗ | ✗ |
| Adapters ESX/ox_inventory/oxmysql | ✓ | ✓ (dégradation propre) | ✓ | ✗ (nécessite FXServer) | ✗ | ✗ |
| Migrations SQL (001, 002) | ✓ | ✓ | ✓ (idempotentes) | ✗ | ✗ | ✗ |
| Perf p50/p95/p99 (§10) | protocole défini | ✗ | ✗ | ✗ | ✗ (à mesurer) | ✗ |
| Logiciel de gestion desktop | ✗ (spécifié §9, non demandé dans ce lot) | ✗ | ✗ | ✗ | ✗ | ✗ |

## Documentation

| Document | Contenu |
|---|---|
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | panel + ressource + server.cfg + déploiement progressif A→E |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | référence des seuils, grâces, urgence vs révision |
| [docs/PANEL.md](docs/PANEL.md) | guide panel + matrice de permissions (5 rôles) |
| [docs/FLUX.md](docs/FLUX.md) | flux métier bout en bout + invariants + scénarios résilience |
| [docs/RULEBOOK.md](docs/RULEBOOK.md) | fiches RG-XXX-NNN + calibrage |
| [docs/SECURITE.md](docs/SECURITE.md) | modèle de menace, preuves, confidentialité, limites |
| [docs/API.md](docs/API.md) | API v1 + endpoints panel + santé |
| [MANIFEST.txt](MANIFEST.txt) | somme de contrôle SHA-256 de chaque fichier (§31) |
| [CHANGELOG.md](CHANGELOG.md) | changements réels |
