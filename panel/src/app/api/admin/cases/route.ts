/**
 * GET /api/admin/cases — liste des dossiers d'incident
 * Query: status, q (nom joueur), take
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

export async function GET(req: Request) {
  const guard = await requireStaff("VIEW_CASES");
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  const take = Math.min(200, Math.max(1, parseInt(url.searchParams.get("take") ?? "50", 10) || 50));

  const where: Record<string, unknown> = {};
  if (status && ["OPEN", "REVIEWING", "ESCALATED", "CLOSED_FP", "CLOSED_SANCTION", "DISMISSED"].includes(status)) {
    where.status = status;
  }
  if (q) where.player = { name: { contains: q } };

  const cases = await db.caseFile.findMany({
    where,
    include: {
      player: { select: { id: true, name: true, license: true, riskScore: true, isOnline: true } },
      assignedTo: { select: { id: true, username: true } },
      notes: { select: { id: true } },
      _count: { select: { detections: true } },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return Response.json({ cases });
}
