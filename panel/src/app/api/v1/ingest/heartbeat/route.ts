/**
 * POST /api/v1/ingest/heartbeat
 * Battement de cœur de la ressource FiveM (X-API-Key).
 * v2.1 (§16.1): accepte aussi l'état de santé déclaré (PRET/DEGRADE/ARRET),
 * la taille de la file de preuves locale et le nombre de détecteurs actifs.
 */
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { jsonError } from "@/lib/anticheat";

const VALID_STATES = ["INITIALISATION", "PRET", "DEGRADE", "ARRET"];

export async function POST(req: Request) {
  const server = await requireApiKey(req);
  if (!server) return jsonError("Clé API invalide ou manquante", 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* body optionnel */ }

  const state = String(body.state ?? "PRET");
  await db.gameServer.update({
    where: { id: server.id },
    data: {
      onlinePlayers: Math.max(0, Number(body.onlinePlayers ?? 0)),
      maxPlayers: Math.max(1, Number(body.maxPlayers ?? server.maxPlayers)),
      version: body.version ? String(body.version) : server.version,
      isOnline: state !== "ARRET",
      healthState: VALID_STATES.includes(state) ? state : "DEGRADE",
      queueSize: Math.max(0, Math.min(10000, Number(body.queueSize ?? 0))),
      detectorsActive: Math.max(0, Math.min(100, Number(body.detectorsActive ?? 0))),
      lastHeartbeat: new Date(),
    },
  });

  return Response.json({ ok: true, serverTime: new Date().toISOString() });
}
