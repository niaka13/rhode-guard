/**
 * PATCH  /api/admin/servers/[id] — { regenerateKey?: true, name?, ip? }
 * DELETE /api/admin/servers/[id]
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { randomBytes } from "crypto";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("MANAGE_SERVERS");
  if (guard.error) return guard.error;

  const { id } = await params;
  let body: { regenerateKey?: boolean; name?: string; ip?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const server = await db.gameServer.findUnique({ where: { id } });
  if (!server) return Response.json({ error: "Serveur introuvable" }, { status: 404 });

  const newKey = body.regenerateKey ? randomBytes(24).toString("hex") : server.apiKey;
  await db.gameServer.update({
    where: { id },
    data: {
      ...(body.regenerateKey ? { apiKey: newKey } : {}),
      ...(body.name ? { name: body.name } : {}),
      ...(body.ip !== undefined ? { ip: body.ip } : {}),
    },
  });
  if (body.regenerateKey) {
    await db.auditLog.create({
      data: { staffId: guard.staff.id, action: "KEY_REGENERATE", target: server.name, details: "{}" },
    });
  }
  return Response.json({ ok: true, apiKey: newKey });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("MANAGE_SERVERS");
  if (guard.error) return guard.error;
  const { id } = await params;
  const server = await db.gameServer.findUnique({ where: { id } });
  if (!server) return Response.json({ error: "Serveur introuvable" }, { status: 404 });
  // Détache les bans liés puis supprime les détections rattachées au serveur
  await db.ban.updateMany({ where: { serverId: id }, data: { serverId: null } });
  await db.detection.deleteMany({ where: { serverId: id } });
  await db.gameServer.delete({ where: { id } });
  await db.auditLog.create({
    data: { staffId: guard.staff.id, action: "SERVER_DELETE", target: server.name, details: "{}" },
  });
  return Response.json({ ok: true });
}
