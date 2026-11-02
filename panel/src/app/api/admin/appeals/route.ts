/**
 * GET /api/admin/appeals?filter=pending|decided|all&page=1
 * Liste des appels de sanction avec contexte (ban, joueur, détections).
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

const PAGE_SIZE = 10;

export async function GET(req: Request) {
  const { error } = await requireStaff("VIEW_APPEALS");
  if (error) return error;

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "pending";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const where =
    filter === "pending"
      ? { status: "PENDING" }
      : filter === "decided"
        ? { status: { in: ["ACCEPTED", "REJECTED"] } }
        : {};

  const [appeals, total] = await Promise.all([
    db.appeal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        ban: {
          include: {
            player: { select: { id: true, name: true, license: true, riskScore: true, isOnline: true } },
            createdBy: { select: { username: true } },
          },
        },
        handledBy: { select: { username: true } },
      },
    }),
    db.appeal.count({ where }),
  ]);

  return Response.json({
    appeals: appeals.map((a) => ({
      id: a.id,
      playerName: a.playerName,
      license: a.license,
      contact: a.contact,
      statement: a.statement,
      status: a.status,
      decisionNote: a.decisionNote,
      createdAt: a.createdAt,
      decidedAt: a.decidedAt,
      handledBy: a.handledBy?.username ?? null,
      ban: {
        id: a.ban.id,
        type: a.ban.type,
        reason: a.ban.reason,
        hwidBan: a.ban.hwidBan,
        isAuto: a.ban.isAuto,
        createdAt: a.ban.createdAt,
        expiresAt: a.ban.expiresAt,
        revokedAt: a.ban.revokedAt,
        createdBy: a.ban.createdBy?.username ?? null,
        player: a.ban.player,
      },
    })),
    total,
    pageSize: PAGE_SIZE,
    page,
  });
}
