/**
 * PATCH  /api/admin/staff/[id] — { role?, isActive? } (OWNER)
 * DELETE /api/admin/staff/[id] (OWNER, auto-protection)
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { ROLES } from "@/lib/permissions";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("MANAGE_STAFF");
  if (guard.error) return guard.error;

  const { id } = await params;
  let body: { role?: string; isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const target = await db.staff.findUnique({ where: { id } });
  if (!target) return Response.json({ error: "Compte introuvable" }, { status: 404 });
  if (target.username === "owner" && guard.staff.username !== "owner") {
    return Response.json({ error: "Impossible de modifier le compte owner" }, { status: 403 });
  }
  if (target.username === "owner" && (body.role || body.isActive === false)) {
    return Response.json({ error: "Le compte owner ne peut pas être rétrogradé ni désactivé" }, { status: 400 });
  }

  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as (typeof ROLES)[number])) {
      return Response.json({ error: "Rôle invalide" }, { status: 400 });
    }
  }

  const updated = await db.staff.update({
    where: { id },
    data: {
      ...(body.role ? { role: body.role } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });

  await db.auditLog.create({
    data: {
      staffId: guard.staff.id,
      action: "STAFF_UPDATE",
      target: target.username,
      details: JSON.stringify({ role: updated.role, isActive: updated.isActive }),
    },
  });

  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("MANAGE_STAFF");
  if (guard.error) return guard.error;

  const { id } = await params;
  const target = await db.staff.findUnique({ where: { id } });
  if (!target) return Response.json({ error: "Compte introuvable" }, { status: 404 });
  if (target.username === "owner") return Response.json({ error: "Le compte owner ne peut pas être supprimé" }, { status: 400 });
  if (target.id === guard.staff.id) return Response.json({ error: "Impossible de supprimer votre propre compte" }, { status: 400 });

  await db.staff.delete({ where: { id } });
  await db.auditLog.create({
    data: { staffId: guard.staff.id, action: "STAFF_DELETE", target: target.username, details: "{}" },
  });
  return Response.json({ ok: true });
}
