/**
 * POST /api/admin/bans/[id]/revoke — lever un ban { reason }
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { discordEmbed, fireWebhooks } from "@/lib/anticheat";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("REVOKE_BAN");
  if (guard.error) return guard.error;
  const { staff } = guard;

  const { id } = await params;
  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch { /* optionnel */ }

  const ban = await db.ban.findUnique({ where: { id }, include: { player: true } });
  if (!ban) return Response.json({ error: "Ban introuvable" }, { status: 404 });
  if (ban.revokedAt) return Response.json({ error: "Ban déjà révoqué" }, { status: 400 });

  await db.ban.update({
    where: { id },
    data: {
      revokedAt: new Date(),
      revokedById: staff.id,
      revokeReason: body.reason?.trim() || "Aucun motif fourni",
    },
  });

  await db.auditLog.create({
    data: {
      staffId: staff.id,
      action: "BAN_REVOKE",
      target: ban.player.name,
      details: JSON.stringify({ raison: body.reason ?? "" }),
    },
  });

  await fireWebhooks("unban", () =>
    discordEmbed({
      title: "BAN RÉVOQUÉ",
      description: `Le ban de **${ban.player.name}** a été levé par ${staff.username}.`,
      severity: "LOW",
      fields: [{ name: "Motif de levée", value: body.reason?.trim() || "Aucun motif fourni", inline: false }],
    })
  );

  return Response.json({ ok: true });
}
