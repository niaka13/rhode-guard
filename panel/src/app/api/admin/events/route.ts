/** GET /api/admin/events — fil d'activité minimal, réservé au staff connecté. */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import type { LiveEvent } from "@/lib/panel-types";

export async function GET(req: Request) {
  const guard = await requireStaff("VIEW_DASHBOARD");
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const requested = url.searchParams.get("since");
  const parsed = requested ? new Date(requested) : new Date(Date.now() - 60_000);
  if (!Number.isFinite(parsed.getTime())) return Response.json({ error: "Curseur invalide" }, { status: 400 });
  const since = new Date(Math.max(parsed.getTime(), Date.now() - 60 * 60_000));
  const upperBound = new Date();
  const [detections, bans, cases] = await Promise.all([
    db.detection.findMany({ where: { createdAt: { gt: since, lte: upperBound } }, orderBy: { createdAt: "asc" }, take: 30, select: { id: true, type: true, severity: true, createdAt: true, player: { select: { name: true } } } }),
    db.ban.findMany({ where: { OR: [{ createdAt: { gt: since, lte: upperBound } }, { revokedAt: { gt: since, lte: upperBound } }] }, orderBy: { createdAt: "asc" }, take: 20, select: { id: true, reason: true, isAuto: true, createdAt: true, revokedAt: true, player: { select: { name: true } } } }),
    db.caseFile.findMany({ where: { updatedAt: { gt: since, lte: upperBound } }, orderBy: { updatedAt: "asc" }, take: 20, select: { id: true, ref: true, summary: true, updatedAt: true, player: { select: { name: true } } } }),
  ]);

  const events: LiveEvent[] = [
    ...detections.map((row) => ({ id: `d-${row.id}`, kind: "detection" as const, severity: row.severity, type: row.type, playerName: row.player.name, at: row.createdAt.toISOString() })),
    ...bans.map((row) => ({ id: `b-${row.id}-${row.revokedAt ? "revoked" : "created"}`, kind: row.revokedAt ? "unban" as const : "ban" as const, playerName: row.player.name, reason: row.reason, isAuto: row.isAuto, at: (row.revokedAt ?? row.createdAt).toISOString() })),
    ...cases.map((row) => ({ id: `c-${row.id}-${row.updatedAt.toISOString()}`, kind: "case" as const, ref: row.ref, type: row.summary, playerName: row.player.name, at: row.updatedAt.toISOString() })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return Response.json({ events, cursor: upperBound.toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}
