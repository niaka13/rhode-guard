/**
 * GET /api/v1/config — configuration live pour la ressource FiveM (X-API-Key).
 * La ressource interroge cet endpoint périodiquement:
 * - mode global (OBSERVATION / AUDIT / ENFORCE) → coupe-circuit général
 * - activation + seuils par détecteur → kill-switch unitaire sans redémarrage
 * - auto-sanction → comportement attendu côté panel en mode ENFORCE
 */
import { requireApiKey } from "@/lib/api-auth";
import { jsonError } from "@/lib/anticheat";
import { getSettings } from "@/lib/settings";

export async function GET(req: Request) {
  const server = await requireApiKey(req);
  if (!server) return jsonError("Clé API invalide ou manquante", 401);

  const settings = await getSettings();
  return Response.json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    mode: settings.mode,
    detectors: settings.detectors,
    autoSanction: settings.autoSanction,
  });
}
