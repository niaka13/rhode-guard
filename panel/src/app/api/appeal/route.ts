/**
 * RHODE GUARD ULTIMATE — Appels de sanction (public, sans compte staff)
 *
 * POST /api/appeal  — soumettre un appel
 *   body: { license, playerName, statement, contact? }
 *   - la licence doit correspondre à un ban ACTIF (non révoqué, non expiré)
 *   - un seul appel par sanction, aucun nouvel appel après décision
 *   - rate-limit par IP (anti-spam)
 *
 * GET /api/appeal?license=... — suivre le statut de son appel
 *   - réponse minimisée: statut, décision, date — jamais de données staff
 */
import { db } from "@/lib/db";
import { jsonError, fireWebhooks, discordEmbed } from "@/lib/anticheat";

// ---- Rate-limit mémoire simple (fenêtre glissante 1h, 5 soumissions/IP) ----
const WINDOW_MS = 3600_000;
const MAX_PER_WINDOW = 5;
const buckets = new Map<string, number[]>();

function appealRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const list = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    return { ok: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - list[0])) / 1000) };
  }
  list.push(now);
  buckets.set(ip, list);
  // purge périodique des buckets vides (borne mémoire)
  if (buckets.size > 512) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= WINDOW_MS)) buckets.delete(k);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

function isActiveBan(ban: { revokedAt: Date | null; expiresAt: Date | null }) {
  if (ban.revokedAt) return false;
  if (ban.expiresAt && ban.expiresAt < new Date()) return false;
  return true;
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: Request) {
  const rl = appealRateLimit(clientIp(req));
  if (!rl.ok) {
    return Response.json(
      { error: `Trop de soumissions. Réessaie dans ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let body: { license?: string; playerName?: string; statement?: string; contact?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Corps JSON invalide");
  }

  const license = (body.license ?? "").trim();
  const playerName = (body.playerName ?? "").trim().slice(0, 64);
  const statement = (body.statement ?? "").trim().slice(0, 2000);
  const contact = (body.contact ?? "").trim().slice(0, 128) || null;

  if (!license || !license.startsWith("license:")) {
    return jsonError("Licence requise (format: license:xxxx...)");
  }
  if (statement.length < 30) {
    return jsonError("Explique ta situation en au moins 30 caractères");
  }

  // Ban actif correspondant à cette licence ?
  const player = await db.player.findUnique({
    where: { license },
    include: { bans: { orderBy: { createdAt: "desc" } } },
  });
  if (!player) return jsonError("Aucun joueur connu avec cette licence");

  const ban = player.bans.find(isActiveBan);
  if (!ban) return jsonError("Aucune sanction active trouvée pour cette licence — rien à contester");

  // Un seul appel en attente par ban
  const existing = await db.appeal.findFirst({
    where: { banId: ban.id, status: "PENDING" },
  });
  if (existing) {
    return jsonError("Un appel est déjà en cours pour cette sanction");
  }
  // Pas de nouvel appel si un appel a déjà été décidé pour ce ban (1 appel par sanction)
  const decided = await db.appeal.findFirst({
    where: { banId: ban.id, status: { in: ["ACCEPTED", "REJECTED"] } },
  });
  if (decided) {
    return jsonError("Cette sanction a déjà été examinée en appel — la décision est finale");
  }

  const appeal = await db.appeal.create({
    data: { banId: ban.id, playerName, license, statement, contact },
  });
  await db.ban.update({ where: { id: ban.id }, data: { appealStatus: "PENDING" } });

  // Audit (action publique, sans staff)
  await db.auditLog.create({
    data: {
      action: "APPEAL_SUBMIT",
      target: player.name,
      details: JSON.stringify({ appealId: appeal.id, banId: ban.id, ip: clientIp(req) }),
    },
  });

  // Alerte staff (webhook) — non bloquant
  await fireWebhooks(
    "appeal.submit",
    () =>
      discordEmbed({
        title: "Appel de sanction soumis",
        description: `**${playerName || player.name}** conteste sa sanction.`,
        severity: "MEDIUM",
        fields: [
          { name: "Motif du ban", value: ban.reason.slice(0, 200), inline: false },
          { name: "Plaidoirie", value: statement.slice(0, 500), inline: false },
          { name: "Licence", value: `\`${license.slice(0, 24)}…\``, inline: true },
        ],
      })
  );

  return Response.json({
    ok: true,
    appeal: { id: appeal.id, status: "PENDING", createdAt: appeal.createdAt },
  });
}

export async function GET(req: Request) {
  const license = new URL(req.url).searchParams.get("license")?.trim() ?? "";
  if (!license.startsWith("license:")) return jsonError("Licence requise");

  const appeal = await db.appeal.findFirst({
    where: { license },
    orderBy: { createdAt: "desc" },
  });
  if (!appeal) return jsonError("Aucun appel trouvé pour cette licence");

  // Réponse minimisée: aucune donnée staff, aucun identifiant interne
  return Response.json({
    status: appeal.status,
    submittedAt: appeal.createdAt,
    decidedAt: appeal.decidedAt,
    decisionNote: appeal.status === "PENDING" ? null : appeal.decisionNote,
  });
}
