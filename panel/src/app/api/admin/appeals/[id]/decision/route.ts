/**
 * POST /api/admin/appeals/[id]/decision
 * Statue sur un appel: { decision: "ACCEPTED" | "REJECTED", note: string }
 *
 * - ACCEPTED → lève la sanction (ban révoqué avec motif = décision d'appel)
 * - REJECTED → le ban est maintenu, l'appel est clôturé
 * - note obligatoire dans les deux cas (jamais de décision silencieuse)
 * - audit + webhook systématiques
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { jsonError, fireWebhooks, discordEmbed } from "@/lib/anticheat";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("DECIDE_APPEALS");
  if (guard.error) return guard.error;
  const staff = guard.staff;

  const { id } = await ctx.params;

  let body: { decision?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Corps JSON invalide");
  }

  const decision = body.decision;
  const note = (body.note ?? "").trim().slice(0, 500);
  if (decision !== "ACCEPTED" && decision !== "REJECTED") {
    return jsonError("Décision invalide (ACCEPTED ou REJECTED)");
  }
  if (note.length < 5) {
    return jsonError("Un motif d'au moins 5 caractères est obligatoire");
  }

  const appeal = await db.appeal.findUnique({
    where: { id },
    include: { ban: { include: { player: true } } },
  });
  if (!appeal) return jsonError("Appel introuvable", 404);
  if (appeal.status !== "PENDING") return jsonError("Cet appel a déjà été statué");

  // 1) Marque la décision sur l'appel
  await db.appeal.update({
    where: { id },
    data: { status: decision, decisionNote: note, handledById: staff.id, decidedAt: new Date() },
  });

  // 2) Met à jour le ban: ACCEPTED → révocation avec motif tracé
  if (decision === "ACCEPTED") {
    await db.ban.update({
      where: { id: appeal.banId },
      data: {
        appealStatus: "ACCEPTED",
        revokedById: staff.id,
        revokedAt: new Date(),
        revokeReason: `Appel accepté: ${note}`,
      },
    });
  } else {
    await db.ban.update({
      where: { id: appeal.banId },
      data: { appealStatus: "REJECTED" },
    });
  }

  // 3) Audit complet
  await db.auditLog.create({
    data: {
      staffId: staff.id,
      action: decision === "ACCEPTED" ? "APPEAL_ACCEPT" : "APPEAL_REJECT",
      target: appeal.ban.player.name,
      details: JSON.stringify({
        appealId: appeal.id,
        banId: appeal.banId,
        note,
        sanctionLevee: decision === "ACCEPTED",
      }),
    },
  });

  // 4) Webhook staff
  await fireWebhooks(
    decision === "ACCEPTED" ? "appeal.accepted" : "appeal.rejected",
    () =>
      discordEmbed({
        title: decision === "ACCEPTED" ? "Appel accepté — sanction levée" : "Appel rejeté — sanction maintenue",
        description: `Joueur: **${appeal.playerName || appeal.ban.player.name}**`,
        severity: decision === "ACCEPTED" ? "LOW" : "MEDIUM",
        fields: [
          { name: "Décision par", value: staff.username, inline: true },
          { name: "Motif du ban initial", value: appeal.ban.reason.slice(0, 200), inline: false },
          { name: "Motif de la décision", value: note, inline: false },
        ],
      })
  );

  return Response.json({ ok: true, decision, sanctionLevee: decision === "ACCEPTED" });
}
