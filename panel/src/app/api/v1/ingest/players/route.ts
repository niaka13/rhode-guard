/**
 * POST /api/v1/ingest/players
 * Événements join/leave depuis la ressource FiveM (X-API-Key).
 * body: { event: "join" | "leave", license, name, identifiers?, hwid? }
 */
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { jsonError } from "@/lib/anticheat";

export async function POST(req: Request) {
  const server = await requireApiKey(req);
  if (!server) return jsonError("Clé API invalide ou manquante", 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide");
  }

  const event = String(body.event ?? "");
  const license = String(body.license ?? "");
  const name = String(body.name ?? "Inconnu");
  if (!["join", "leave"].includes(event)) return jsonError("event doit être join ou leave");
  if (!license.startsWith("license:")) return jsonError("license invalide");

  const player = await db.player.upsert({
    where: { license },
    create: {
      license,
      name,
      identifiers: JSON.stringify(body.identifiers ?? {}),
      hwids: JSON.stringify(body.hwid ? [body.hwid] : []),
      isOnline: event === "join",
      lastSeen: new Date(),
    },
    update: {
      name,
      isOnline: event === "join",
      lastSeen: new Date(),
    },
  });

  if (event === "join" && body.hwid) {
    // Mémorise le HWID si nouveau (suivi matériel)
    try {
      const hwids = JSON.parse(player.hwids) as string[];
      if (!hwids.includes(String(body.hwid))) {
        hwids.push(String(body.hwid));
        await db.player.update({ where: { id: player.id }, data: { hwids: JSON.stringify(hwids) } });
      }
    } catch { /* ignore */ }
  }

  // Recompte les joueurs en ligne sur ce serveur
  const online = await db.player.count({ where: { isOnline: true } });
  await db.gameServer.update({
    where: { id: server.id },
    data: { onlinePlayers: online, isOnline: true, lastHeartbeat: new Date() },
  });

  return Response.json({ ok: true, playerId: player.id, onlinePlayers: online });
}
