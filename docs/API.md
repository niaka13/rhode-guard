# RHODE GUARD ULTIMATE — API

## API v1 (ressource ↔ panel) — en-tête `X-API-Key` obligatoire

### POST /api/v1/ingest/detection
```json
{
  "license": "license:hex",            // requis
  "name": "Pseudo",
  "type": "SPEEDHACK",                  // voir types ci-dessous
  "severity": "HIGH",                   // LOW | MEDIUM | HIGH | CRITICAL
  "confidence": 90,                     // 0-100
  "source": "SERVEUR",                  // CLIENT | SERVEUR | CROISEE
  "detectorVersion": "2.0.0",
  "identifiers": { "steam": "steam:..." },
  "hwid": "token-hwid",
  "details": { "faits chiffrés": "..." },
  "evidenceHash": "empreinte-integrite"
}
```
Réponse:
```json
{
  "ok": true,
  "detectionId": "cuid",
  "caseRef": "RG-2026-0033",   // dossier regroupé/créé
  "riskScore": 42,
  "mode": "AUDIT",
  "enforce": false,             // la ressource n'agit QUE si true
  "autoBan": null               // { id, expiresAt } si sanction auto appliquée
}
```
Comportement selon le mode panel: OBSERVATION/AUDIT → enregistre + dossier +
alertes; ENFORCE → peut appliquer l'auto-sanction configurée.

**Types acceptés**: SPEEDHACK, TELEPORT, FLY_NOCLIP, SUPERJUMP, GODMODE, INVISIBLE,
COLLISION_OFF, WEAPON_CADENCE, BLACKLIST_WEAPON, ONE_HIT_KILL, VEHICLE_MODEL,
VEHICLE_FLOOD, ECONOMY_ANOMALY, DUPLICATION, TELEMETRY_MISMATCH, EVENT_FLOOD,
EVENT_INVALID.

### POST /api/v1/ingest/players
```json
{ "event": "join" | "leave", "license": "license:hex", "name": "Pseudo",
  "identifiers": { ... }, "hwid": "token" }
```

### POST /api/v1/ingest/heartbeat
```json
{ "onlinePlayers": 42, "maxPlayers": 64, "version": "2.1.0" }
```

### GET /api/v1/health *(v2.1 — §16.1/§19)*
État NON SENSIBLE pour opérateurs (aucun identifiant joueur, aucun détail de preuve):
```json
{
  "ok": true,
  "panel": { "db": true, "mode": "AUDIT", "rulesActive": 11, "rulesTotal": 11, "rulebookVersion": "2.1.0" },
  "server": { "name": "…", "state": "PRET", "queueSize": 0, "detectorsActive": 11, "heartbeatAgeSec": 23, "dataFresh": true },
  "volume": { "onlinePlayers": 42, "activeBans": 9, "openCases": 21, "detections24h": 65 }
}
```

### POST /api/v1/ingest/heartbeat *(v2.1 — enrichi)*
```json
{ "onlinePlayers": 42, "maxPlayers": 64, "version": "2.1.0",
  "state": "PRET", "queueSize": 0, "detectorsActive": 11 }
```
`state`: INITIALISATION | PRET | DEGRADE | ARRET.

### GET /api/v1/config
Réponse: `{ ok, mode, detectors: { <module>: { enabled, ...seuils } }, autoSanction }`
→ synchronisée par la ressource toutes les 60 s (kill-switch live).

### GET /api/v1/bans/check?identifier=license:xxx
Réponse: `{ banned: bool, ban?: { reason, type, expiresAt } }`
(en mode autonome, la vérification est locale/cache).

## Endpoints panel (session staff, cookie httpOnly)

| Méthode | Route | Permission |
|---|---|---|
| POST | /api/admin/login | — (rate-limit 8/10 min/IP) |
| POST | /api/admin/logout | session |
| GET | /api/admin/me | session |
| GET | /api/admin/stats | VIEW_DASHBOARD |
| GET | /api/admin/players, /players/[id] | VIEW_PLAYERS |
| GET | /api/admin/detections (filtres: type, severity, source, playerId, caseId, page) | VIEW_DETECTIONS |
| POST | /api/admin/detections/[id]/false | MARK_FALSE_POSITIVE |
| GET | /api/admin/cases (filtres: status, q) | VIEW_CASES |
| GET | /api/admin/cases/[id] (+ machine.allowedTargets) | VIEW_CASES |
| PATCH | /api/admin/cases/[id] — transitions validées + motif (§28) | MANAGE_CASES |
| POST | /api/admin/cases/[id]/notes | CASE_NOTES |
| GET | /api/admin/cases/staff-options | VIEW_CASES |
| GET/POST | /api/admin/bans · POST /[id]/revoke | VIEW_BANS / CREATE + REVOKE |
| GET/PATCH | /api/admin/settings (PATCH = urgence tracée) | VIEW / MANAGE_SETTINGS |
| GET/POST | /api/admin/config/revisions — liste / brouillon | VIEW / MANAGE_SETTINGS |
| POST | /api/admin/config/revisions/[id]/{validate,approve,activate,rollback} | MANAGE_SETTINGS |
| GET/POST/PATCH/DELETE | /api/admin/staff, webhooks, servers | rôles dédiés |
| GET | /api/admin/audit | VIEW_AUDIT (OWNER, ADMIN, AUDITOR) |

**Machine à états des dossiers (§28)** — transitions permises:
`OPEN → REVIEWING | ESCALATED | clôtures` · `REVIEWING → OPEN | ESCALATED | clôtures` ·
`ESCALATED → REVIEWING | clôtures` · clôtures → `REVIEWING` (réouverture motivée).
Codes d'erreur: 409 = transition non permise, 400 + `requiresReason: true` = motif requis.

Toutes les mutations sont **auditées** (action, cible, détails, auteur, date).
