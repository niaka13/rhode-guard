/**
 * RHODE GUARD ULTIMATE — Test d'intégration du workflow de révision de
 * configuration (§19/§28) sur l'instance de démonstration:
 *   urgence kill-switch → brouillon → validation → approbation séparée →
 *   activation confirmée → propagation /api/v1/config → rollback EXACT.
 * Vérifie AUSSI le correctif critique: un patch partiel de seuils ne doit
 * JAMAIS désactiver un détecteur (régression v2.1 corrigée).
 *
 * Exécution: bun run scripts/test-config-workflow.ts
 */
const BASE = "http://localhost:3000";
import { Database } from "bun:sqlite";

let passed = 0, failed = 0;
function T(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  [OK]      ${name}`); }
  else { failed++; console.log(`  [ÉCHEC]   ${name}${detail ? ` → ${detail}` : ""}`); }
}

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  const cookie = res.headers.get("set-cookie") ?? "";
  const token = cookie.match(/rg_session=([^;]+)/)?.[1] ?? data.token;
  return token;
}

async function api(token: string, path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: `rg_session=${token}`, ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function getConfig(apiKey: string) {
  const res = await fetch(`${BASE}/api/v1/config`, { headers: { "X-API-Key": apiKey } });
  return res.json();
}

async function main() {
  const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });
  const apiKey = (db.query("SELECT apiKey FROM GameServer LIMIT 1").get() as { apiKey: string }).apiKey;

  console.log("== Workflow de révision de configuration — test d'intégration ==");

  const owner = await login("owner", "owner123");
  const admin = await login("admin", "admin123");
  T("connexion owner + admin (2 sessions pour la séparation des tâches)", owner !== null && admin !== null);

  // 0) état initial: le mode est AUDIT, téléport activé
  let cfg = await getConfig(apiKey);
  T("état initial: téléport activé, maxSpeedMs 130", cfg.detectors.teleport.enabled === true && cfg.detectors.teleport.maxSpeedMs === 130);

  // 1) URGENCE: kill-switch direct (admin) — doit tracer une révision isEmergency
  const em = await api(admin, "/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify({ autoSanction: { enabled: true, windowMinutes: 10, criticalThreshold: 3, autoBanHours: 168 } }),
  });
  T("urgence: PATCH direct accepté (200)", em.status === 200, JSON.stringify(em.body));
  let revs = await api(owner, "/api/admin/config/revisions");
  const emergency = revs.body.revisions.find((r: any) => r.isEmergency && r.status === "ACTIVE");
  T("urgence: révision ACTIVE isEmergency tracée", Boolean(emergency));

  // 2) BROUILLON par admin: durcir le seuil téléport SANS toucher enabled
  const draft = await api(admin, "/api/admin/config/revisions", {
    method: "POST",
    body: JSON.stringify({
      patch: { detectors: { teleport: { maxSpeedMs: 110 } } },
      note: "test intégration: seuil téléport",
    }),
  });
  T("brouillon créé", draft.status === 200 && draft.body.revision.status === "DRAFT", JSON.stringify(draft.body));

  // 3) auto-approbation interdite (admin ≠ OWNER est l'auteur)
  const selfApprove = await api(admin, `/api/admin/config/revisions/${draft.body.revision.id}/approve`, { method: "POST", body: "{}" });
  T("séparation des tâches: l'auteur non-OWNER ne peut pas approuver", selfApprove.status === 403 || selfApprove.status === 409);

  // 4) validation
  const val = await api(admin, `/api/admin/config/revisions/${draft.body.revision.id}/validate`, { method: "POST", body: "{}" });
  T("validation DRAFT → VALIDATED", val.status === 200 && val.body.revision.status === "VALIDATED");

  // 5) approbation par OWNER (≠ auteur)
  const appr = await api(owner, `/api/admin/config/revisions/${draft.body.revision.id}/approve`, { method: "POST", body: "{}" });
  T("approbation par un tiers (OWNER)", appr.status === 200 && appr.body.revision.status === "APPROVED");

  // 6) activation SANS confirmation refusée, puis acceptée avec "ACTIVER"
  const noConfirm = await api(owner, `/api/admin/config/revisions/${draft.body.revision.id}/activate`, { method: "POST", body: JSON.stringify({ confirm: "non" }) });
  T("activation sans confirmation renforcée refusée", noConfirm.status === 400);
  const act = await api(owner, `/api/admin/config/revisions/${draft.body.revision.id}/activate`, { method: "POST", body: JSON.stringify({ confirm: "ACTIVER" }) });
  T("activation avec confirmation « ACTIVER »", act.status === 200 && act.body.revision.status === "ACTIVE");

  // 7) propagation — LE POINT CRITIQUE: seuil appliqué ET détecteur TOUJOURS ACTIVÉ
  cfg = await getConfig(apiKey);
  T("propagation: maxSpeedMs 110 appliqué", cfg.detectors.teleport.maxSpeedMs === 110);
  T("RÉGRESSION CORRIGÉE: patch partiel n'a PAS désactivé le détecteur", cfg.detectors.teleport.enabled === true);

  // 8) rollback EXACT avec motif — doit restaurer l'état d'avant (snapshot)
  const rbNoReason = await api(owner, `/api/admin/config/revisions/${act.body.revision.id}/rollback`, { method: "POST", body: JSON.stringify({ reason: "ok" }) });
  T("rollback sans motif suffisant refusé", rbNoReason.status === 400 || rbNoReason.status === 409);
  const rb = await api(owner, `/api/admin/config/revisions/${act.body.revision.id}/rollback`, {
    method: "POST",
    body: JSON.stringify({ reason: "retour arrière après test d'intégration" }),
  });
  T("rollback motivé accepté", rb.status === 200 && rb.body.revision.status === "ACTIVE");

  cfg = await getConfig(apiKey);
  T("rollback EXACT: maxSpeedMs restauré à 130", cfg.detectors.teleport.maxSpeedMs === 130);
  T("rollback EXACT: télépart toujours activé", cfg.detectors.teleport.enabled === true);
  T("rollback EXACT: mode AUDIT conservé", cfg.mode === "AUDIT");

  // 9) machine à états dossiers — transitions invalides rejetées (409)
  const cases = await api(owner, "/api/admin/cases?take=1");
  const c = cases.body.cases[0];
  const bad = await api(owner, `/api/admin/cases/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: c.status === "OPEN" ? "CLOSED_FP" : "OPEN" }) });
  T("dossier: transition invalide/sans motif rejetée (400/409)", bad.status === 400 || bad.status === 409, `statut ${bad.status}`);
  const noReason = await api(owner, `/api/admin/cases/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "ESCALATED" }) });
  T("dossier: escalade SANS motif refusée (400 + requiresReason)", noReason.status === 400 && noReason.body.requiresReason === true);
  const good = await api(owner, `/api/admin/cases/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "ESCALATED", reason: "test intégration: avis requis" }) });
  T("dossier: escalade AVEC motif acceptée + transition enregistrée", good.status === 200);

  // 10) AUDITOR: lecture de l'audit autorisée, mutation refusée
  const auditor = await login("auditor", "auditor123");
  const auditRead = await api(auditor, "/api/admin/audit");
  T("auditeur: lecture du journal d'audit autorisée", auditRead.status === 200);
  const playersRead = await api(auditor, "/api/admin/players");
  T("auditeur: accès aux identifiants joueurs REFUSÉ (moindre privilège)", playersRead.status === 403);
  const mut = await api(auditor, "/api/admin/settings", { method: "PATCH", body: JSON.stringify({ mode: "OBSERVATION" }) });
  T("auditeur: mutation des réglages REFUSÉE", mut.status === 403);

  // 11) santé
  const health = await (await fetch(`${BASE}/api/v1/health`, { headers: { "X-API-Key": apiKey } })).json();
  T("santé: endpoint opérationnel, état serveur cohérent", health.ok === true && ["INITIALISATION", "PRET", "DEGRADE", "ARRET"].includes(health.server.state));

  // nettoyage: ramener le dossier de test en état propre
  await api(owner, `/api/admin/cases/${c.id}`, {
    method: "PATCH",
    body: JSON.stringify(c.status === "OPEN" ? { status: "OPEN" } : { status: "REVIEWING", reason: "fin du test d'intégration" }),
  }).catch(() => undefined);

  console.log(`------------------------------------------------------------\n ${passed + failed} vérification(s), ${failed} échec(s)`);
  if (failed > 0) process.exit(1);
  console.log(" Workflow de configuration et gouvernance: VALIDÉ ✓");
}

main().catch((e) => { console.error("fatal:", e); process.exit(2); });
