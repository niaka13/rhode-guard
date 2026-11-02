# RHODE GUARD ULTIMATE — Guide du panel & matrice de permissions

> **Statut : spécification, pas application installée.** Au 2 novembre 2026, ce
> dépôt contient la ressource FiveM, mais aucun code d’interface web RHODE Guard.
> Le serveur fonctionne en mode autonome; aucune URL de panel ni clé API n’est
> configurée. Les vues, rôles et comportements ci-dessous décrivent la cible à
> construire et à vérifier avant d’annoncer le panel comme disponible.

La cible doit être en français, responsive (ordinateur/tablette/téléphone),
accessible au clavier et auditer chaque action sensible.

## Vues

| Vue | Rôle | Points clés |
|---|---|---|
| **Dashboard** | tous | bandeau MODE, **bandeau santé par serveur** (PRET/DÉGRADÉ/ARRÊT, file, fraîcheur), stats live, graphique 24 h, flux temps réel, top risque |
| **Dossiers** | tous (consultation) | file de revue avec **machine à états motivée** (§28): OUVERT → EN REVUE → ESCALADÉ → CLÔTURÉ (faux positif/sanction) ou REJETÉ; réouverture motivée; **historique de transitions**; assignation; notes; appel |
| **Joueurs** | tous | recherche, filtre en ligne, fiche: risque, identifiants (repliés), dossiers, détections, bans |
| **Détections** | tous | filtres type/sévérité/**source** (client/serveur/croisée), détail JSON au clic, marquage faux positif |
| **Sanctions** | selon rôle | bans actifs/expirés/révoqués, création (bornée par rôle), levée motivée, badge APPEL |
| **Réglages** | lecture: tous · écriture: ADMIN+ | mode global, kill-switch + seuils par détecteur, auto-sanction, rétention — confirmation pour ENFORCE; **workflow de révision** (brouillon → validation → approbation séparée → activation confirmée, diff, rollback) ou urgence tracée |
| **Staff** | OWNER | comptes, rôles, activation |
| **Audit** | ADMIN+ | journal immuable: connexions, échecs, sanctions, changements de réglages, actions dossiers |
| **Webhooks** | ADMIN+ | Discord: `detection.high`, `ban`, `unban`, `case.open`, test d'envoi |
| **Serveurs** | OWNER | clé API par serveur (régénérable), heartbeats |
| **Installation** | tous | guide + architecture + exports + note de sécurité |

## Matrice de permissions (RBAC, refus par défaut, vérifiée CÔTÉ SERVEUR)

Mapping rôles implémentés ↔ rôles métier de la spécification (§20):
OWNER=Administrateur · ADMIN=Ingénieur sécurité/Admin délégué · MODERATOR=Modérateur/Analyste · SUPPORT=Observateur/Analyse lecture · **AUDITOR=Auditeur**.

| Permission | OWNER | ADMIN | MODERATOR | SUPPORT | AUDITOR |
|---|:-:|:-:|:-:|:-:|:-:|
| Consulter (dashboard, détections, bans, dossiers) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Consulter les joueurs (identifiants) | ✓ | ✓ | ✓ | ✓ | — |
| Marquer faux positif | ✓ | ✓ | ✓ | — | — |
| Gérer les dossiers (transitions motivées, assignation, appel) | ✓ | ✓ | ✓ | — | — |
| Notes d'enquête | ✓ | ✓ | ✓ | — | — |
| Ban temporaire | ✓ ≤ 1 an | ✓ ≤ 90 j | ✓ ≤ **7 j** | — | — |
| Ban permanent | ✓ | ✓ | — | — | — |
| Blacklist HWID | ✓ | ✓ | — | — | — |
| Lever un ban | ✓ | ✓ | — | — | — |
| Voir l'audit | ✓ | ✓ | — | — | ✓ |
| Gérer webhooks / réglages | ✓ | ✓ | — | — | — |
| Gérer staff / serveurs | ✓ | — | — | — | — |

Rôles entièrement configurables (§20 « jamais codés en dur comme unique source »):
la matrice vit dans `src/lib/permissions.ts` côté serveur — l'UI ne décide jamais.

## Création du premier compte

Créer le compte propriétaire dans le flux d’installation du panel avec un mot de passe unique, puis supprimer tout compte de démonstration avant exposition publique. Aucun identifiant ni mot de passe par défaut n’est fourni dans ce dépôt.

## Bonnes pratiques d'enquête

1. Ouvrir le **dossier** (pas la détection isolée): chronologie + notes.
2. Vérifier la **source**: `serveur`/`croisée` = forte confiance; `client` = à
   corroborer (le client peut mentir).
3. Croiser le contexte ESX (métier, soldes) et le ping (lag ≠ cheat).
4. Conclure: FAUX POSITIF (le score de risque en tient compte), SANCTION
   (motivée, durée selon politique), ou REJETÉ (pas assez de preuves).
5. Les appels passent par le statut d'appel du dossier/ban — jamais de
   modification silencieuse.
