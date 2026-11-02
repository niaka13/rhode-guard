# RHODE GUARD ULTIMATE — Référence de configuration

Tous les seuils vivent dans `config/shared.lua` et sont **surchargeables en live**
depuis le panel (RÉGLAGES → PATCH → propagation sous 60 s via `/api/v1/config`).
Le fichier local reste la valeur de repli au démarrage.

## Grâces (anti faux positifs)

| Situation | Grâce | Origine |
|---|---|---|
| Connexion | 10 s | serveur (playerJoining) |
| Spawn/réapparition | 8 s client / 3 s serveur | les deux |
| Entrée/sortie véhicule | 1,5 s | client |
| Téléport autorisé (`AuthorizeTeleport`) | 5 s | export |
| Intérieur/ascenseur (Δz massif, Δxy faible) | ignoré avec trace | serveur |
| Pause menu, mort, collision en chargement, ragdoll | contrôle suspendu | client |

## Modules — seuils et sens d'ajustement

### speedhack
| Clé | Défaut | Sens |
|---|---|---|
| maxSpeedOnFoot | 12.5 m/s | ↑ si faux positifs latence; ↓ jamais sous 9 |
| maxSpeedSwim | 5.5 m/s | ↑ si nage rapide moddée |
| vehicleMargin | ×1.25 | marge vs vitesse max théorique du véhicule |
| strikes / cooldown / decay | 3 / 20 s / 60 s | ↑ strikes = moins de signalements |

### teleport (vérification SERVEUR — la plus fiable)
| Clé | Défaut | Sens |
|---|---|---|
| maxSpeedMs | 130 m/s | ↓ pour être plus strict; les avions légitimes dépassent → privilégie `AuthorizeTeleport` |
| graceSpawnSec | 8 s | grâce spawn |
| rollback | true | **ENFORCE uniquement** — repositionne au dernier point valide (1/10 s, 2 tentatives max, jamais en boucle) |

### fly / noclip / superjump / godmode / invisible (signal client + corroboration)
| Clé | Défaut | Note |
|---|---|---|
| fly.minAirTime | 3.5 s | en l'air sans véhicule/parachute/échelle |
| fly.maxFallSpeed | 90 m/s | skydive légitime ~80 |
| noclip.minTime | 2.0 s | sans collision en mouvement |
| superjump.maxJumpVelocity | 9.0 | saut légitime ~8.4 |
| godmode.minDuration | 5 s | hors contexte (events staff = bypass ace) |
| invisible.minDuration | 3 s | — |

### combat (signal client agrégé — limites connues)
| Clé | Défaut | Note |
|---|---|---|
| maxKillsPerMin | 20 | kills fatals signalés / min / attaquant |
| maxDamagePerHit | 200 | **ajuste selon tes armes moddées**; explosions/écrasements peuvent dépasser |
| blacklistedWeapons | {} | hashes `GetHashKey('WEAPON_XXX')` |

### vehicle
| Clé | Défaut | Note |
|---|---|---|
| maxSpawnsPerMin | 4 | véhicules DISTINCTS conduits / min |
| blacklistedModels | {} | ex. `{ `deluxo` }` (backticks = hash) |

### economy (exports — voir README)
| Clé | Défaut | Note |
|---|---|---|
| maxAmountPerOp | 500 000 $ | borne ABSOLUE par opération validée |
| maxOpsPerMin | 10 | fenêtre glissante |
| idempotence | TTL 10 min | une clé = un crédit unique (retries/double-clics inoffensifs) |

### telemetry (vérif croisée)
| Clé | Défaut | Note |
|---|---|---|
| mismatchTolerance | 0.35 | écart relatif toléré (latence) |
| minSamples | 5 | jamais de conclusion sur moins de 5 échantillons |

## Anti-spoof & watchdog

| Clé | Défaut | Note |
|---|---|---|
| tokenRefresh | 120 s | rotation du token joueur |
| maxEventsPerMin | 12 | quota de signalements client |
| kickOnSpoof | false | observation initiale, sans kick sur token invalide |
| watchdogSilence | 300 s | silence client → alerte d'observation RG-01 |
| kickOnSilentClient | false | reste désactivé tant que la compatibilité client n'est pas validée |

## Panel → RÉGLAGES

- **Mode global** (kill-switch général) + toggle et seuils **par détecteur**
  (kill-switch unitaire), sans redémarrage.
- **Auto-sanction** (ENFORCE): fenêtre, seuil de détections HIGH+, durée du ban
  auto. Toute action est auditée et le joueur peut faire appel (dossier).
- **Rétention**: faux positifs 90 j · bans/dossiers 365 j · audit 180 j.

## Escalade des bans autonomes

Dans `config/server.lua`, `Config.AutoBan.levels` définit la durée après chaque nouvelle sanction confirmée : 24 h, 7 jours, 30 jours, puis permanent. Le compteur est conservé dans `rhode_bans`; `rgunban` lève la sanction active sans effacer l'historique, afin qu'une récidive reste au palier suivant. Pour remettre à zéro un compteur après examen humain, modifier la ligne concernée en base avec une action d'administration auditée. Le ban automatique ne s'applique que si les seuils de preuves serveur recoupées sont atteints et si la lecture/écriture SQL réussit.
