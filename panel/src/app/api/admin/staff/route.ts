/**
 * GET  /api/admin/staff — liste (MANAGE_STAFF)
 * POST /api/admin/staff — créer { username, password, role }
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { hashPassword } from "@/lib/auth";
import { ROLES } from "@/lib/permissions";

export async function GET() {
  const guard = await requireStaff("MANAGE_STAFF");
  if (guard.error) return guard.error;

  const staff = await db.staff.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, username: true, role: true, isActive: true, lastLoginAt: true, createdAt: true,
      _count: { select: { bansCreated: true, auditLogs: true } },
    },
  });
  return Response.json({ staff });
}

export async function POST(req: Request) {
  const guard = await requireStaff("MANAGE_STAFF");
  if (guard.error) return guard.error;

  let body: { username?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  const username = body.username?.trim();
  const password = body.password ?? "";
  const role = body.role ?? "SUPPORT";

  if (!username || username.length < 3) return Response.json({ error: "Nom d'utilisateur (3+ chars) requis" }, { status: 400 });
  if (password.length < 6) return Response.json({ error: "Mot de passe (6+ chars) requis" }, { status: 400 });
  if (!ROLES.includes(role as (typeof ROLES)[number])) return Response.json({ error: "Rôle invalide" }, { status: 400 });
  if (username === "owner" && guard.staff.role !== "OWNER") {
    return Response.json({ error: "Nom réservé" }, { status: 400 });
  }

  const exists = await db.staff.findUnique({ where: { username } });
  if (exists) return Response.json({ error: "Ce nom d'utilisateur existe déjà" }, { status: 409 });

  const created = await db.staff.create({
    data: { username, passwordHash: hashPassword(password), role },
  });
  await db.auditLog.create({
    data: { staffId: guard.staff.id, action: "STAFF_CREATE", target: username, details: JSON.stringify({ role }) },
  });

  return Response.json({ ok: true, id: created.id });
}
