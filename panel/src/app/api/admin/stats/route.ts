/**
 * GET /api/admin/stats — données du dashboard
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const guard = await requireStaff("VIEW_DASHBOARD");
  if (guard.error) return guard.error;

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 3600_000);
  const d7 = new Date(now.getTime() - 7 * 86400_000);

  const [
    onlinePlayers,
    detections24h,
    activeBans,
    totalPlayers,
    servers,
    byType,
    topRisk,
    recent,
    hourly,
    openCases,
    settings,
  ] = await Promise.all([
    db.player.count({ where: { isOnline: true } }),
    db.detection.count({ where: { createdAt: { gte: h24 } } }),
    db.ban.count({ where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    db.player.count(),
    db.gameServer.findMany({
      select: { id: true, name: true, isOnline: true, onlinePlayers: true, maxPlayers: true, lastHeartbeat: true, version: true, ip: true, healthState: true, queueSize: true, detectorsActive: true },
    }),
    db.detection.groupBy({
      by: ["type"],
      where: { createdAt: { gte: d7 } },
      _count: { _all: true },
    }),
    db.player.findMany({
      where: { riskScore: { gte: 30 } },
      orderBy: { riskScore: "desc" },
      take: 5,
      select: { id: true, name: true, riskScore: true, isOnline: true, license: true },
    }),
    db.detection.findMany({
      include: { player: { select: { name: true, license: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.detection.findMany({
      where: { createdAt: { gte: h24 } },
      select: { createdAt: true, severity: true },
    }),
    db.caseFile.count({ where: { status: { in: ["OPEN", "REVIEWING", "ESCALATED"] } } }),
    getSettings(),
  ]);

  // Répartition par heure (24 buckets)
  const hourBuckets = Array.from({ length: 24 }, (_, i) => {
    const bucketStart = new Date(h24.getTime() + i * 3600_000);
    return { hour: bucketStart.toISOString(), count: 0 };
  });
  for (const d of hourly) {
    const idx = Math.floor((d.createdAt.getTime() - h24.getTime()) / 3600_000);
    if (idx >= 0 && idx < 24) hourBuckets[idx].count++;
  }

  return Response.json({
    onlinePlayers,
    detections24h,
    activeBans,
    totalPlayers,
    servers,
    byType: byType.map((t) => ({ type: t.type, count: t._count._all })).sort((a, b) => b.count - a.count),
    topRisk,
    recent,
    hourly: hourBuckets,
    openCases,
    mode: settings.mode,
  });
}
