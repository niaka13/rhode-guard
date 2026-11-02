/**
 * POST /api/v1/ingest/detection — reçoit une détection depuis la ressource FiveM (X-API-Key).
 *
 * Comportement selon le mode global (réglages panel):
 * - OBSERVATION: enregistre + dossier, aucune sanction, aucune action demandée
 * - AUDIT:       enregistre + dossier + alertes staff, aucune sanction automatique
 * - ENFORCE:     idem AUDIT + auto-sanction (si configurée) + demande d'action à la ressource
 *
 * Regroupe automatiquement les détections d'un même joueur en dossier (fenêtre 60 min).
 */
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { SEVERITY_WEIGHT, VALID_TYPES, discordEmbed, fireWebhooks, jsonError, nextCaseRef } from "@/lib/anticheat";
import { applyRetention, getSettings } from "@/lib/settings";

const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const VALID_SOURCES = ["CLIENT", "SERVEUR", "CROISEE"];
const CASE_WINDOW_MS = 60 * 60_000; // regroupement dossier: 60 min

export async function POST(req: Request) {
  const server = await requireApiKey(req);
  if (!server) return jsonError("Clé API invalide ou manquante", 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide");
  }

  const license = String(body.license ?? "");
  const name = String(body.name ?? "Inconnu");
  const type = String(body.type ?? "");
  const severity = String(body.severity ?? "MEDIUM");
  const source = String(body.source ?? "CLIENT");
  const detectorVersion = String(body.detectorVersion ?? "2.0.0").slice(0, 16);

  if (!license.startsWith("license:")) return jsonError("license manquante ou invalide");
  if (!VALID_TYPES.includes(type)) return jsonError(`type invalide (valides: ${VALID_TYPES.join(", ")})`);
  if (!VALID_SEVERITIES.includes(severity)) return jsonError("sévérité invalide");
  if (!VALID_SOURCES.includes(source)) return jsonError("source invalide (CLIENT, SERVEUR, CROISEE)");

  // Limite la taille du payload de faits (preuve minimisée, pas de dump brut)
  let details: Record<string, unknown> = {};
  if (body.details && typeof body.details === "object") {
    details = body.details as Record<string, unknown>;
    const serialized = JSON.stringify(details);
    if (serialized.length > 4096) {
      details = { tronque: true, taille: serialized.length };
    }
  }

  const settings = await getSettings();

  // Upsert du joueur
  const player = await db.player.upsert({
    where: { license },
    create: {
      license,
      name,
      identifiers: JSON.stringify(body.identifiers ?? {}),
      hwids: JSON.stringify(body.hwid ? [body.hwid] : []),
      isOnline: true,
      lastSeen: new Date(),
    },
    update: { name, isOnline: true, lastSeen: new Date() },
  });

  // ---- Regroupement en dossier (fenêtre glissante par joueur) ----
  const windowStart = new Date(Date.now() - CASE_WINDOW_MS);
  let caseFile = await db.caseFile.findFirst({
    where: {
      playerId: player.id,
      status: { in: ["OPEN", "REVIEWING"] },
      updatedAt: { gte: windowStart },
    },
    orderBy: { updatedAt: "desc" },
  });
  let caseOpened = false;
  if (!caseFile) {
    caseFile = await db.caseFile.create({
      data: {
        ref: await nextCaseRef(),
        playerId: player.id,
        serverId: server.id,
        status: "OPEN",
        summary: type,
      },
    });
    caseOpened = true;
  }

  const detection = await db.detection.create({
    data: {
      serverId: server.id,
      playerId: player.id,
      type,
      severity,
      confidence: Math.max(0, Math.min(100, Number(body.confidence ?? 85))),
      source,
      detectorVersion,
      details: JSON.stringify(details),
      evidence: body.evidenceHash ? String(body.evidenceHash).slice(0, 128) : null,
      caseId: caseFile.id,
    },
  });

  // Met à jour le résumé du dossier (types agrégés)
  const caseCounts = await db.detection.groupBy({
    by: ["type"],
    where: { caseId: caseFile.id },
    _count: { _all: true },
  });
  const summary = caseCounts
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 4)
    .map((c) => `${c.type} x${c._count._all}`)
    .join(", ");
  await db.caseFile.update({ where: { id: caseFile.id }, data: { summary } });

  // Score de risque (plafonné à 100, pondéré par sévérité)
  const newRisk = Math.min(100, player.riskScore + (SEVERITY_WEIGHT[severity] ?? 2));
  await db.player.update({ where: { id: player.id }, data: { riskScore: newRisk } });

  // ---- Auto-sanction: UNIQUEMENT en mode ENFORCE + config activée ----
  let autoBan: { id: string; expiresAt: Date; reason: string } | null = null;
  const enforce = settings.mode === "ENFORCE" && settings.autoSanction.enabled;
  if (enforce) {
    const since = new Date(Date.now() - settings.autoSanction.windowMinutes * 60_000);
    const recentCritical = await db.detection.count({
      where: {
        playerId: player.id,
        severity: { in: ["HIGH", "CRITICAL"] },
        createdAt: { gte: since },
        isFalse: false,
      },
    });
    if (recentCritical >= settings.autoSanction.criticalThreshold) {
      const activeBan = await db.ban.findFirst({
        where: { playerId: player.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      });
      if (!activeBan) {
        const ban = await db.ban.create({
          data: {
            playerId: player.id,
            serverId: server.id,
            type: "TEMP",
            reason: `Auto-sanction (${settings.autoSanction.criticalThreshold}+ détections majeures en ${settings.autoSanction.windowMinutes} min — ${type})`,
            hwidBan: false,
            identifiersHit: JSON.stringify([license]),
            expiresAt: new Date(Date.now() + settings.autoSanction.autoBanHours * 3600_000),
            isAuto: true,
            caseId: caseFile.id,
          },
        });
        autoBan = { id: ban.id, expiresAt: ban.expiresAt!, reason: ban.reason };
        await fireWebhooks("ban", () =>
          discordEmbed({
            title: "AUTO-BAN (mode ENFORCE)",
            description: `**${name}** a été banni automatiquement (${Math.round(settings.autoSanction.autoBanHours / 24)} jours).`,
            severity: "CRITICAL",
            fields: [
              { name: "Raison", value: autoBan!.reason, inline: false },
              { name: "Dossier", value: caseFile!.ref, inline: true },
              { name: "Licence", value: `\`${license}\``, inline: true },
              { name: "Score de risque", value: `${newRisk}/100`, inline: true },
            ],
          })
        );
      }
    }
  }

  // ---- Webhooks: ouverture de dossier + détections majeures ----
  if (caseOpened) {
    await fireWebhooks("case.open", () =>
      discordEmbed({
        title: "Dossier ouvert",
        description: `Nouveau dossier **${caseFile!.ref}** pour **${name}**.`,
        severity: severity,
        fields: [
          { name: "Première détection", value: `${type} (${severity})`, inline: true },
          { name: "Source", value: source, inline: true },
          { name: "Serveur", value: server.name, inline: true },
        ],
      })
    );
  }
  if (severity === "HIGH" || severity === "CRITICAL") {
    await fireWebhooks("detection.high", () =>
      discordEmbed({
        title: `Détection ${severity}`,
        description: `**${name}** — ${type.replace("_", " ")} (dossier ${caseFile!.ref})`,
        severity,
        fields: [
          { name: "Confiance", value: `${detection.confidence}%`, inline: true },
          { name: "Source", value: source, inline: true },
          { name: "Score risque", value: `${newRisk}/100`, inline: true },
        ],
      })
    );
  }

  // Purge de rétention (probabiliste, non bloquante)
  if (Math.random() < 0.02) void applyRetention();

  return Response.json({
    ok: true,
    detectionId: detection.id,
    caseRef: caseFile.ref,
    riskScore: newRisk,
    mode: settings.mode,
    enforce, // la ressource n'applique kick/rollback QUE si true
    autoBan: autoBan ? { id: autoBan.id, expiresAt: autoBan.expiresAt } : null,
  });
}
