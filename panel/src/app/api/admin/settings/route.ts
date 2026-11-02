/**
 * GET   /api/admin/settings — réglages (mode, détecteurs, auto-sanction, rétention)
 * PATCH /api/admin/settings — CHEMIN D'URGENCE (kill-switch): application immédiate,
 *        audité + révision ACTIVE isEmergency enregistrée (§28: piste complète).
 *        Pour les changements planifiés → workflow /api/admin/config/revisions
 *        (brouillon → validation → approbation séparée → activation).
 */
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/api-auth";
import { getSettings, sanitizeSettingsPatch, saveSettings, MODE_DESCRIPTIONS } from "@/lib/settings";
import { recordEmergencyRevision } from "@/lib/config-revisions";

export async function GET() {
  const guard = await requireStaff("VIEW_SETTINGS");
  if (guard.error) return guard.error;
  const settings = await getSettings();
  return Response.json({ settings, modeDescriptions: MODE_DESCRIPTIONS });
}

export async function PATCH(req: Request) {
  const guard = await requireStaff("MANAGE_SETTINGS");
  if (guard.error) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const clean = sanitizeSettingsPatch(body);
  if (Object.keys(clean).length === 0) {
    return Response.json({ error: "Aucune modification valide fournie" }, { status: 400 });
  }

  const before = await getSettings();
  const settings = await saveSettings(clean);

  // Piste de gouvernance complète, même en urgence (jamais bloquante)
  void recordEmergencyRevision(clean, guard.staff.id);

  await db.auditLog.create({
    data: {
      staffId: guard.staff.id,
      action: "SETTINGS_UPDATE",
      target: "réglages (urgence)",
      details: JSON.stringify({
        modifications: clean,
        modeAvant: before.mode,
        modeApres: settings.mode,
      }),
    },
  });

  return Response.json({ ok: true, settings });
}
