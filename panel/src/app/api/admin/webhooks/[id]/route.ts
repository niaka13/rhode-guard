/**
 * PATCH  /api/admin/webhooks/[id] — { name?, url?, events?, isActive? }
 * DELETE /api/admin/webhooks/[id]
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

const VALID_EVENTS = ["detection.high", "ban", "unban", "server.offline"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("MANAGE_WEBHOOKS");
  if (guard.error) return guard.error;

  const { id } = await params;
  let body: { name?: string; url?: string; events?: string[]; isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const hook = await db.webhook.findUnique({ where: { id } });
  if (!hook) return Response.json({ error: "Webhook introuvable" }, { status: 404 });

  if (body.url !== undefined && !body.url.startsWith("https://discord.com/api/webhooks/")) {
    return Response.json({ error: "URL Discord webhook invalide" }, { status: 400 });
  }
  if (body.events !== undefined) {
    body.events = body.events.filter((e) => VALID_EVENTS.includes(e));
    if (body.events.length === 0) return Response.json({ error: "Au moins un événement requis" }, { status: 400 });
  }

  await db.webhook.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.url ? { url: body.url } : {}),
      ...(body.events ? { events: JSON.stringify(body.events) } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  await db.auditLog.create({
    data: { staffId: guard.staff.id, action: "WEBHOOK_UPDATE", target: hook.name, details: JSON.stringify({ isActive: body.isActive }) },
  });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff("MANAGE_WEBHOOKS");
  if (guard.error) return guard.error;
  const { id } = await params;
  const hook = await db.webhook.findUnique({ where: { id } });
  if (!hook) return Response.json({ error: "Webhook introuvable" }, { status: 404 });
  await db.webhook.delete({ where: { id } });
  await db.auditLog.create({
    data: { staffId: guard.staff.id, action: "WEBHOOK_DELETE", target: hook.name, details: "{}" },
  });
  return Response.json({ ok: true });
}
