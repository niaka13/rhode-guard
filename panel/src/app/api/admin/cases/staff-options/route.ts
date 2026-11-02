/**
 * GET /api/admin/cases/staff-options — liste minimale du staff pour l'assignation
 * de dossiers (pas de données sensibles: id, pseudo, rôle).
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

export async function GET() {
  const guard = await requireStaff("VIEW_CASES");
  if (guard.error) return guard.error;

  const staff = await db.staff.findMany({
    where: { isActive: true },
    orderBy: { username: "asc" },
    select: { id: true, username: true, role: true },
  });
  return Response.json({ staff });
}
