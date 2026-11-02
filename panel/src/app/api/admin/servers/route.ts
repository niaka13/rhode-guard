/**
 * GET  /api/admin/servers — serveurs de jeu enregistrés (MANAGE_SERVERS)
 * POST /api/admin/servers — { name, ip?, maxPlayers? } génère une clé API
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { randomBytes } from "crypto";

export async function GET() {
  const guard = await requireStaff("MANAGE_SERVERS");
  if (guard.error) return guard.error;
  const servers = await db.gameServer.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json({ servers });
}

export async function POST(req: Request) {
  const guard = await requireStaff("MANAGE_SERVERS");
  if (guard.error) return guard.error;

  let body: { name?: string; ip?: string; maxPlayers?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "Nom du serveur requis" }, { status: 400 });

  const server = await db.gameServer.create({
    data: {
      name,
      ip: body.ip?.trim() || null,
      maxPlayers: body.maxPlayers && body.maxPlayers > 0 ? body.maxPlayers : 64,
      apiKey: randomBytes(24).toString("hex"),
    },
  });
  await db.auditLog.create({
    data: { staffId: guard.staff.id, action: "SERVER_CREATE", target: name, details: "{}" },
  });
  return Response.json({ ok: true, id: server.id, apiKey: server.apiKey });
}
