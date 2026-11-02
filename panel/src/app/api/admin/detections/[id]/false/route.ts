/**
 * POST /api/admin/detections/[id]/false — marquer / démarquer un faux positif
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("MARK_FALSE_POSITIVE");
  if (guard.error) return guard.error;

  const { id } = await params;
  const detection = await db.detection.findUnique({ where: { id } });
  if (!detection) return Response.json({ error: "Détection introuvable" }, { status: 404 });

  const updated = await db.detection.update({
    where: { id },
    data: { isFalse: !detection.isFalse },
  });

  // Si faux positif confirmé, on retire du score de risque
  const SEVERITY_WEIGHT: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 4, CRITICAL: 6 };
  const delta = updated.isFalse ? -(SEVERITY_WEIGHT[updated.severity] ?? 2) : (SEVERITY_WEIGHT[updated.severity] ?? 2);
  const player = await db.player.findUnique({ where: { id: updated.playerId } });
  if (player) {
    await db.player.update({
      where: { id: player.id },
      data: { riskScore: Math.max(0, Math.min(100, player.riskScore + delta)) },
    });
  }

  await db.auditLog.create({
    data: {
      staffId: guard.staff.id,
      action: updated.isFalse ? "FALSE_POSITIVE_MARK" : "FALSE_POSITIVE_UNMARK",
      target: player?.name ?? updated.playerId,
      details: JSON.stringify({ type: updated.type, severity: updated.severity }),
    },
  });

  return Response.json({ ok: true, isFalse: updated.isFalse });
}
