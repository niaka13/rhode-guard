/**
 * GET /api/admin/players?search=&online=&page=
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

export async function GET(req: Request) {
  const guard = await requireStaff("VIEW_PLAYERS");
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const online = url.searchParams.get("online");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  const where = {
    ...(online === "1" ? { isOnline: true } : online === "0" ? { isOnline: false } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { license: { contains: search } },
          ],
        }
      : {}),
  };

  const [players, total] = await Promise.all([
    db.player.findMany({
      where,
      orderBy: [{ riskScore: "desc" }, { lastSeen: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { detections: true, bans: true } } },
    }),
    db.player.count({ where }),
  ]);

  return Response.json({
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      license: p.license,
      riskScore: p.riskScore,
      isOnline: p.isOnline,
      playTimeMin: p.playTimeMin,
      lastSeen: p.lastSeen,
      firstSeen: p.firstSeen,
      detectionCount: p._count.detections,
      banCount: p._count.bans,
    })),
    total,
    page,
    pageSize,
  });
}
