/**
 * RHODE GUARD ULTIMATE — Guards pour les routes API
 */
import { db } from "@/lib/db";
import { currentStaff, type StaffCtx } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";

/** Auth staff via cookie de session. Retourne soit le staff, soit une Response d'erreur. */
export async function requireStaff(permission?: Permission): Promise<{ staff: StaffCtx; error?: never } | { staff?: never; error: Response }> {
  const staff = await currentStaff();
  if (!staff) {
    return { error: Response.json({ error: "Non authentifié" }, { status: 401 }) };
  }
  if (permission && !can(staff.role, permission)) {
    return { error: Response.json({ error: "Permission refusée pour ce rôle" }, { status: 403 }) };
  }
  return { staff };
}

/** Auth serveur de jeu via en-tête X-API-Key. */
export async function requireApiKey(req: Request) {
  const key = req.headers.get("x-api-key");
  if (!key) return null;
  return db.gameServer.findUnique({ where: { apiKey: key } });
}

