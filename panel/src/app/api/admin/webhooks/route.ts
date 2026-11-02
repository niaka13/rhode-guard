/**
 * GET  /api/admin/webhooks
 * POST /api/admin/webhooks — { name, url, events[] }
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";

const VALID_EVENTS = ["detection.high", "ban", "unban", "case.open", "server.offline"];

export async function GET() {
  const guard = await requireStaff("MANAGE_WEBHOOKS");
  if (guard.error) return guard.error;
  const webhooks = await db.webhook.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json({ webhooks, validEvents: VALID_EVENTS });
}

export async function POST(req: Request) {
  const guard = await requireStaff("MANAGE_WEBHOOKS");
  if (guard.error) return guard.error;

  let body: { name?: string; url?: string; events?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  const name = body.name?.trim();
  const url = body.url?.trim();
  const events = (body.events ?? []).filter((e) => VALID_EVENTS.includes(e));

  if (!name) return Response.json({ error: "Nom requis" }, { status: 400 });
  if (!url || !url.startsWith("https://discord.com/api/webhooks/")) {
    return Response.json({ error: "URL Discord webhook invalide (doit commencer par https://discord.com/api/webhooks/)" }, { status: 400 });
  }
  if (events.length === 0) return Response.json({ error: "Sélectionnez au moins un événement" }, { status: 400 });

  const created = await db.webhook.create({
    data: { name, url, events: JSON.stringify(events), isActive: true },
  });
  await db.auditLog.create({
    data: { staffId: guard.staff.id, action: "WEBHOOK_CREATE", target: name, details: JSON.stringify({ events }) },
  });
  return Response.json({ ok: true, id: created.id });
}
