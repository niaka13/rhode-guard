/**
 * GET /api/admin/players/[id] — fiche joueur complète
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("VIEW_PLAYERS");
  if (guard.error) return guard.error;

  const { id } = await params;
  const player = await db.player.findUnique({
    where: { id },
    include: {
      detections: { orderBy: { createdAt: "desc" }, take: 50 },
      bans: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { username: true } }, revokedBy: { select: { username: true } } } },
      cases: { orderBy: { updatedAt: "desc" }, take: 20, include: { assignedTo: { select: { username: true } }, _count: { select: { detections: true } } } },
    },
  });
  if (!player) return Response.json({ error: "Joueur introuvable" }, { status: 404 });

  return Response.json({
    id: player.id,
    name: player.name,
    license: player.license,
    identifiers: JSON.parse(player.identifiers || "{}"),
    hwids: JSON.parse(player.hwids || "[]"),
    riskScore: player.riskScore,
    isOnline: player.isOnline,
    playTimeMin: player.playTimeMin,
    firstSeen: player.firstSeen,
    lastSeen: player.lastSeen,
    detections: player.detections,
    bans: player.bans,
    cases: player.cases,
  });
}
