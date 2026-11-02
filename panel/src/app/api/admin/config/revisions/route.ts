/**
 * GET  /api/admin/config/revisions — historique des révisions de configuration
 * POST /api/admin/config/revisions — créer un BROUILLON { patch, note } (ne publie rien)
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { createDraft } from "@/lib/config-revisions";

export async function GET() {
  const guard = await requireStaff("VIEW_SETTINGS");
  if (guard.error) return guard.error;

  const revisions = await db.configRevision.findMany({
    orderBy: { revision: "desc" },
    take: 50,
    include: {
      author: { select: { username: true, role: true } },
      approver: { select: { username: true, role: true } },
    },
  });
  return Response.json({ revisions });
}

export async function POST(req: Request) {
  const guard = await requireStaff("MANAGE_SETTINGS");
  if (guard.error) return guard.error;

  let body: { patch?: Record<string, unknown>; note?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.patch || typeof body.patch !== "object") {
    return Response.json({ error: "patch requis" }, { status: 400 });
  }

  const result = await createDraft(body.patch, body.note, guard.staff.id);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, revision: result.revision });
}
