/**
 * GET /api/v1/health — état de santé NON SENSIBLE pour opérateurs (§16.1/§19).
 * Authentifié par clé API serveur (X-API-Key). Aucun identifiant joueur,
 * aucun détail de preuve: composants, mode, file, fraîcheur des données.
 */
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { jsonError } from "@/lib/anticheat";
import { getSettings } from "@/lib/settings";

export async function GET(req: Request) {
  const server = await requireApiKey(req);
  if (!server) return jsonError("Clé API invalide ou manquante", 401);

  const [settings, activeBans, openCases, detections24h] = await Promise.all([
    getSettings(),
    db.ban.count({ where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    db.caseFile.count({ where: { status: { in: ["OPEN", "REVIEWING", "ESCALATED"] } } }),
    db.detection.count({ where: { createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
  ]);

  const activeDetectors = Object.values(settings.detectors).filter((d) => d.enabled).length;
  const totalDetectors = Object.keys(settings.detectors).length;
  const heartbeatAgeSec = Math.floor((Date.now() - server.lastHeartbeat.getTime()) / 1000);

  // Fraîcheur: > 3 intervalles de heartbeat sans signal → données anciennes
  const dataFresh = heartbeatAgeSec < 180;

  return Response.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    panel: {
      db: true, // la requête elle-même prouve l'accès base
      mode: settings.mode,
      rulesActive: activeDetectors,
      rulesTotal: totalDetectors,
      rulebookVersion: "2.1.0",
    },
    server: {
      name: server.name,
      state: server.healthState,
      version: server.version,
      isOnline: server.isOnline,
      queueSize: server.queueSize,
      detectorsActive: server.detectorsActive,
      heartbeatAgeSec,
      dataFresh,
    },
    volume: {
      onlinePlayers: server.onlinePlayers,
      activeBans,
      openCases,
      detections24h,
    },
  });
}
