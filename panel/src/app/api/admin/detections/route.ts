/**
 * GET /api/admin/detections?type=&severity=&playerId=&caseId=&source=&since=&page=
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

export async function GET(req: Request) {
  const guard = await requireStaff("VIEW_DETECTIONS");
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const severity = url.searchParams.get("severity");
  const playerId = url.searchParams.get("playerId");
  const caseId = url.searchParams.get("caseId");
  const source = url.searchParams.get("source");
  const falseOnly = url.searchParams.get("false");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 25;

  const where = {
    ...(type ? { type } : {}),
    ...(severity ? { severity } : {}),
    ...(playerId ? { playerId } : {}),
    ...(caseId ? { caseId } : {}),
    ...(source ? { source } : {}),
    ...(falseOnly === "1" ? { isFalse: true } : {}),
  };

  const [detections, total] = await Promise.all([
    db.detection.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        player: { select: { id: true, name: true, license: true, riskScore: true } },
        server: { select: { name: true } },
      },
    }),
    db.detection.count({ where }),
  ]);

  return Response.json({ detections, total, page, pageSize });
}
