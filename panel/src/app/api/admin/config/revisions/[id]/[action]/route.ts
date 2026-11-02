/**
 * POST /api/admin/config/revisions/[id]/validate  — DRAFT → VALIDATED (schéma + diff rafraîchi)
 * POST /api/admin/config/revisions/[id]/approve   — VALIDATED → APPROVED (approbateur ≠ auteur, sauf OWNER)
 * POST /api/admin/config/revisions/[id]/activate  — APPROVED → ACTIVE (confirmation renforcée "ACTIVER")
 * POST /api/admin/config/revisions/[id]/rollback  — retour arrière de la révision ACTIVE (motif requis)
 *
 * Une seule action par appel; le body est minime: { confirm?, reason? }.
 */
import { requireStaff } from "@/lib/api-auth";
import { activateRevision, approveRevision, rollbackActive, validateRevision } from "@/lib/config-revisions";

export async function POST(req: Request, ctx: { params: Promise<{ id: string, action: string }> }) {
  const { id, action } = await ctx.params;

  let body: { confirm?: string; reason?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch { /* corps optionnel */ }

  if (action === "validate") {
    const guard = await requireStaff("MANAGE_SETTINGS");
    if (guard.error) return guard.error;
    const r = await validateRevision(id, guard.staff.id);
    if ("error" in r) return Response.json({ error: r.error }, { status: 409 });
    return Response.json({ ok: true, revision: r.revision });
  }

  if (action === "approve") {
    const guard = await requireStaff("MANAGE_SETTINGS");
    if (guard.error) return guard.error;
    const r = await approveRevision(id, guard.staff.id, guard.staff.role);
    if ("error" in r) return Response.json({ error: r.error }, { status: 403 });
    return Response.json({ ok: true, revision: r.revision });
  }

  if (action === "activate") {
    const guard = await requireStaff("MANAGE_SETTINGS");
    if (guard.error) return guard.error;
    // Confirmation renforcée: le client doit renvoyer le mot exact "ACTIVER"
    if (body.confirm !== "ACTIVER") {
      return Response.json({ error: "Confirmation requise: renvoie { confirm: \"ACTIVER\" }" }, { status: 400 });
    }
    const r = await activateRevision(id, guard.staff.id);
    if ("error" in r) return Response.json({ error: r.error }, { status: 409 });
    return Response.json({ ok: true, revision: r.revision, settings: r.settings });
  }

  if (action === "rollback") {
    const guard = await requireStaff("MANAGE_SETTINGS");
    if (guard.error) return guard.error;
    const reason = (body.reason ?? "").trim();
    if (reason.length < 4) {
      return Response.json({ error: "Motif obligatoire pour un retour arrière" }, { status: 400 });
    }
    const r = await rollbackActive(guard.staff.id, reason);
    if ("error" in r) return Response.json({ error: r.error }, { status: 409 });
    return Response.json({ ok: true, revision: r.revision, settings: r.settings });
  }

  return Response.json({ error: "Action inconnue (valides: validate, approve, activate, rollback)" }, { status: 404 });
}
