/**
 * POST /api/admin/cases/[id]/notes — ajoute une note d'enquête (audit)
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("CASE_NOTES");
  if (guard.error) return guard.error;
  const { id } = await ctx.params;

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const note = (body.body ?? "").trim();
  if (!note) return Response.json({ error: "Note vide" }, { status: 400 });
  if (note.length > 2000) return Response.json({ error: "Note trop longue (2000 caractères max)" }, { status: 400 });

  const existing = await db.caseFile.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Dossier introuvable" }, { status: 404 });

  const created = await db.caseNote.create({
    data: { caseId: id, staffId: guard.staff.id, body: note },
    include: { staff: { select: { username: true } } },
  });

  await db.auditLog.create({
    data: {
      staffId: guard.staff.id,
      action: "CASE_NOTE",
      target: existing.ref,
      details: JSON.stringify({ taille: note.length }),
    },
  });

  return Response.json({ ok: true, note: created });
}
