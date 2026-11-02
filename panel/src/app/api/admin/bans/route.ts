/**
 * GET  /api/admin/bans?active=&page=
 * POST /api/admin/bans — créer un ban { playerId | license, type, reason, durationHours, hwidBan }
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { discordEmbed, fireWebhooks } from "@/lib/anticheat";
import { can, MAX_TEMP_BAN_HOURS, Role } from "@/lib/permissions";

export async function GET(req: Request) {
  const guard = await requireStaff("VIEW_BANS");
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 20;
  const now = new Date();

  const where =
    filter === "active"
      ? { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
      : filter === "expired"
        ? { revokedAt: null, expiresAt: { lte: now } }
        : filter === "revoked"
          ? { revokedAt: { not: null } }
          : {};

  const [bans, total] = await Promise.all([
    db.ban.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        player: { select: { id: true, name: true, license: true } },
        createdBy: { select: { username: true } },
        revokedBy: { select: { username: true } },
      },
    }),
    db.ban.count({ where }),
  ]);

  return Response.json({ bans, total, page, pageSize });
}

export async function POST(req: Request) {
  const guard = await requireStaff("VIEW_BANS");
  if (guard.error) return guard.error;
  const { staff } = guard;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const type = body.type === "PERM" ? "PERM" : "TEMP";
  const reason = String(body.reason ?? "").trim();
  const hwidBan = Boolean(body.hwidBan);
  const durationHours = Number(body.durationHours ?? 0);

  if (!reason) return Response.json({ error: "Motif requis" }, { status: 400 });
  if (type === "PERM" && !can(staff.role, "CREATE_BAN_PERM")) {
    return Response.json({ error: "Seuls ADMIN et OWNER peuvent bannir définitivement" }, { status: 403 });
  }
  if (!can(staff.role, "CREATE_BAN_TEMP")) {
    return Response.json({ error: "Rôle insuffisant pour bannir" }, { status: 403 });
  }
  if (type === "TEMP" && (!durationHours || durationHours <= 0)) {
    return Response.json({ error: "Durée requise pour un ban temporaire" }, { status: 400 });
  }
  const maxHours = MAX_TEMP_BAN_HOURS[staff.role as Role] ?? 0;
  if (type === "TEMP" && durationHours > maxHours) {
    return Response.json({ error: `Durée max pour ${staff.role}: ${maxHours}h` }, { status: 403 });
  }
  if (hwidBan && !can(staff.role, "HWID_BAN")) {
    return Response.json({ error: "Seuls ADMIN et OWNER peuvent blacklister un HWID" }, { status: 403 });
  }

  // Cible: par id ou par license
  let player = null;
  if (body.playerId) player = await db.player.findUnique({ where: { id: String(body.playerId) } });
  else if (body.license) player = await db.player.findUnique({ where: { license: String(body.license) } });
  if (!player) return Response.json({ error: "Joueur introuvable" }, { status: 404 });

  const ban = await db.ban.create({
    data: {
      playerId: player.id,
      createdById: staff.id,
      type,
      reason,
      hwidBan,
      identifiersHit: JSON.stringify([player.license]),
      expiresAt: type === "TEMP" ? new Date(Date.now() + durationHours * 3600_000) : null,
    },
  });

  await db.auditLog.create({
    data: {
      staffId: staff.id,
      action: "BAN_CREATE",
      target: player.name,
      details: JSON.stringify({ type, durationHours, hwidBan, reason }),
    },
  });

  await fireWebhooks("ban", () =>
    discordEmbed({
      title: type === "PERM" ? "BAN PERMANENT" : "BAN TEMPORAIRE",
      description: `**${player!.name}** a été banni par ${staff.username}.`,
      severity: "CRITICAL",
      fields: [
        { name: "Motif", value: reason, inline: false },
        { name: "Type", value: type === "PERM" ? "Permanent" : `${durationHours}h`, inline: true },
        { name: "HWID", value: hwidBan ? "Blacklisté" : "Non", inline: true },
      ],
    })
  );

  return Response.json({ ok: true, banId: ban.id });
}
