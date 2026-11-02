# RHODE GUARD ULTIMATE — Rulebook (fiches de règles v2.1)

Source de vérité : `shared/rulebook.lua` (`RHODE.RULEBOOK_VERSION = 2.1.0`).
Chaque détection porte son `ruleId` + `ruleVersion` dans la preuve.
Intégrité vérifiée par tests (`tests/test_locks_rulebook.lua`).

Matrice par règle — visibilité réelle / source / confiance / coût / faux positifs /
réaction (§29). **Règles à source client uniquement : confiance bornée, jamais de
sanction seule.**

| ID | Règle | Type | Source | Corroboration | Faux positifs connus (extrait) | Réaction par défaut |
|---|---|---|---|---|---|---|
| RG-EVT-001 | Rafale événementielle | EVENT_FLOOD | serveur | serveur | double-clic, script bavard | rejet + incident après seuil |
| RG-EVT-002 | Paramètre hors schéma / token invalide | EVENT_INVALID | serveur | serveur | bug script tiers | rejet avant mutation + incident |
| RG-ECO-001 | Montant/quantité impossible | ECONOMY_ANOMALY | serveur | serveur | grosse vente légitime (ajuster seuil) | rejet, jamais de modif de solde |
| RG-ECO-002 | Récompense/duplication répétée | DUPLICATION | serveur+croisée | croisée | latence d'inventaire | replay idempotent / incident CRITICAL si conflit |
| RG-MOV-001 | Écart de déplacement répété | TELEPORT | serveur | serveur | téléports script, avions, ascenseurs | strikes → dossier; rollback ENFORCE borné |
| RG-MOV-002 | Mouvement incompatible / télémétrie falsifiée | TELEMETRY_MISMATCH | croisée | croisée | latence extrême | CRITICAL → revue humaine |
| RG-MOV-003 | Vitesse anormale répétée | SPEEDHACK | client+serveur | les deux | latence, véhicules moddés | strikes → dossier |
| RG-MOV-004 | Vol sans support | FLY_NOCLIP | client | client (corroboré télémétrie) | mécaniques de vol moddées | strikes → dossier |
| RG-MOV-005 | Traversée de matière | COLLISION_OFF | client | client | collision en chargement (filtrée) | strike → dossier |
| RG-MOV-006 | Saut surréaliste | SUPERJUMP | client | client | trampolines/event | strikes → dossier |
| RG-MOV-007 | Invulnérabilité apparente | GODMODE | client | client | events staff (bypass ace) | strikes → dossier |
| RG-MOV-008 | Invisibilité | INVISIBLE | client | client | events staff (bypass ace) | strike → dossier |
| RG-CMB-001 | Cadence de kills incohérente | WEAPON_CADENCE | serveur (sur déclaré) | partielle | event DM, armes moddées | dossier MEDIUM |
| RG-CMB-002 | Arme interdite | BLACKLIST_WEAPON | client | client | mauvaise config blacklist | dossier HIGH |
| RG-CMB-003 | Dégâts anormaux par coup | ONE_HIT_KILL | client | client | explosions/écrasements | dossier HIGH après seuil |
| RG-CMB-004 | Statistiques de visée anormales | AIMBOT | serveur (stats déclarées, fenêtre 5 min) | partielle | sniper confirmé, event DM | dossier HIGH — jamais de sanction seule |
| RG-CMB-005 | Absence de recul | NO_RECOIL | client | client | armes à recul nul, appuis | dossier MEDIUM après seuil |
| RG-CMB-006 | Munitions infinies apparentes | INFINITE_AMMO | client | client | chargeurs étendus moddés | dossier MEDIUM après 2 lots |
| RG-CMB-007 | Explosions en rafale | EXPLOSION_SPAM | serveur (comptage déclaré) | partielle | event pyrotechnique, chaîne véhicule | dossier HIGH après seuil |
| RG-ENT-001 | Modèle de véhicule interdit | VEHICLE_MODEL | client | client | véhicule event staff | dossier HIGH |
| RG-ENT-002 | Spawn de véhicules en rafale | VEHICLE_FLOOD | serveur (sur déclaré) | partielle | concession, event course | dossier MEDIUM |
| RG-SYS-001 | File saturée / panne dépendance | SYSTEM_ALERT | serveur | serveur | coupure réseau brève | alerte OPÉRATEUR + mode dégradé (jamais silencieux) |

## Format d'une alerte (§17)

Chaque incident embarque : `incidentId` aléatoire · horodatage UTC epoch · license
pseudonymisée · `ruleId` + `ruleVersion` + `detectorVersion` · sévérité · confiance ·
**source** (client/serveur/croisée) · `configApplied` (seuils effectifs au moment
des faits — traçabilité de configuration) · faits minimisés arrondis · contexte ·
empreinte d'intégrité (joaat, limites documentées) · mode au moment de l'incident.

## Calibrage (§17 — protocole)

1. Démarrer en **OBSERVATION** 24-48 h : mesurer alertes/joueur/heure par règle.
2. Annoter les événements légitimes (notes de dossier).
3. Modifier **un seul groupe de paramètres à la fois**, via une révision de
   configuration versionnée (panel → PROPOSER EN RÉVISION).
4. Observer en préproduction, puis déploiement progressif (A→E, §24).
5. Retour arrière disponible : révision précédente réactivable en un clic (motif requis).

Objectifs MESURABLES à définir avec l'opérateur (jamais annoncés avant mesure):
taux de faux positifs revus, latence de traitement p95, retard de persistance,
volume par règle.

## Suppression / désactivation

Une règle dont la seule source est une télémétrie client non fiable ET sans
corroboration possible (ex. dégâts sans visibilité serveur) est marquée
« données insuffisantes » dans sa fiche et sa sévérité est bornée à MEDIUM —
coupe-circuit unitaire dans RÉGLAGES (effet < 60 s), jamais de suppression
silencieuse des contrôles essentiels en cas de surcharge (dégradation documentée §10).
