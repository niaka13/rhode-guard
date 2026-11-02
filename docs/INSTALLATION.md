# RHODE GUARD ULTIMATE — Installation

## 1. Panel web

Le panel (Next.js + Prisma) est une application séparée, déployée sur ton domaine
(HTTPS obligatoire en production: reverse proxy Nginx/Caddy + TLS).

1. Déployer l'application (variables d'environnement: base de données, secrets).
2. Créer le premier compte OWNER (les comptes de démo **owner/admin/modo/support
   doivent être supprimés ou re-mot-de-passés** avant tout usage réel).
3. **SERVEURS → + AJOUTER**: nom du serveur → copier la **clé API** générée.
4. Configurer **WEBHOOKS** (Discord) et le **RÉGLAGES** par défaut (mode OBSERVATION).

## 2. Ressource FiveM

```bash
# déposer le dossier
cp -r rhode_guard /ton/serveur/resources/
```

`config/server.lua`:
```lua
Config.PanelURL = "https://panel.mondomaine.com/api/v1"
Config.ApiKey  = "LA-CLE-COPIEE"
```

`server.cfg` (ordre: dépendances réelles d'abord):
```cfg
ensure oxmysql        # optionnel — mode autonome sans panel
ensure es_extended    # optionnel — contexte économie (ESX Legacy)
ensure ox_inventory   # optionnel — recoupement quantités
ensure rhode_guard

# permissions (voir docs/PANEL.md pour la matrice)
add_ace group.admin rhode.bypass allow   # staff de confiance: détecteurs désactivés
add_ace group.admin rhode.staff  allow   # /rgstatus /rgmode
add_ace group.admin rhode.kick   allow   # /rgkick
add_ace group.modo   rhode.staff  allow
```

## 3. Vérification de démarrage

Console serveur attendue:
```
[RHODE GUARD] adapter ESX Legacy actif (contexte économie enrichi)   # si ESX
[RHODE GUARD] adapter ox_inventory actif (recoupement des quantités) # si ox_inv
[RHODE GUARD] mode autonome oxmysql prêt ...                         # si sans panel
[RHODE GUARD] mode: OBSERVATION | panel: mode autonome | oxmysql local: ...
```
Si une ligne manque → la dépendance n'est pas démarrée: la ressource continue
en mode dégradé documenté (jamais de faux démarrage silencieux sur une dépendance
REQUISE; les trois sont optionnelles).

Vérifications:
- `rgstatus` en console: état, mode, détecteurs actifs, relay.
- Panel → SERVEURS: heartbeat sous 60 s.
- Panel → DASHBOARD: joueurs en ligne en temps réel.

## 4. Environnements

| Environnement | Base | Données | Mode |
|---|---|---|---|
| Développement | locale | synthétiques | OBSERVATION |
| Préproduction | test | synthétiques | AUDIT |
| Production | production | réelles | AUDIT → ENFORCE après étalonnage |

## 5. Déploiement progressif (recommandé)

1. Sauvegarde complète (base + configs) — condition de rollback.
2. Déployer le panel, vérifier l'accès et les comptes.
3. Installer la ressource en **OBSERVATION** 24-48 h: mesurer le volume d'incidents.
4. Passer en **AUDIT**: suivre les dossiers, marquer les faux positifs, ajuster
   les seuils dans RÉGLAGES (propagés sous 60 s, sans redémarrage).
5. Après validation (faux positifs < seuil acceptable POUR TOI), passer en
   **ENFORCE** avec auto-sanction configurée (fenêtre courte, durée modérée).
6. Conserver la procédure d'urgence: RÉGLAGES → mode OBSERVATION (kill-switch
   général) ou coupure d'un détecteur précis — effet sous 60 s.

## 6. Rollback

- Ressource: `stop rhode_guard` puis retirer la ligne `ensure` (aucune donnée de
  gameplay modifiée de manière irréversible; les rollback de position sont
  journalisés).
- Panel: restauration de la base (sauvegardes quotidiennes recommandées).
- Migration SQL locale: `DROP TABLE rhode_incidents; rhode_case_decisions;`
  (voir `migrations/001_init.sql`).
