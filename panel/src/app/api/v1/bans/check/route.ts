/**
 * GET /api/v1/bans/check
 * Vérification de ban à la connexion (appelée par la ressource FiveM).
 * ?identifier=license:xxx  &identifiers=steam:...,discord:...  &hwid=token
 */
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { jsonError } from "@/lib/anticheat";

function isActive(ban: { revokedAt: Date | null; expiresAt: Date | null }) {
  if (ban.revokedAt) return false;
  if (ban.expiresAt && ban.expiresAt < new Date()) return false;
  return true;
}

export async function GET(req: Request) {
  const server = await requireApiKey(req);
  if (!server) return jsonError("Clé API invalide ou manquante", 401);

  const url = new URL(req.url);
  const identifier = url.searchParams.get("identifier") ?? "";
  const identifiersRaw = url.searchParams.get("identifiers") ?? "";
  const hwid = url.searchParams.get("hwid") ?? "";

  if (!identifier) return jsonError("identifier requis");

  // Ensemble des identifiants fournis (license + secondaires + hwid)
  const provided = new Set(
    [identifier, ...identifiersRaw.split(",").map((s) => s.trim()).filter(Boolean), hwid].filter(Boolean) as string[]
  );

  // 1) Bans rattachés au joueur correspondant à cette licence
  const player = await db.player.findUnique({ where: { license: identifier }, include: { bans: true } });
  let ban = player?.bans.find(isActive) ?? null;

  // 2) Recherche par identifiants/HWID dans tous les bans actifs (multi-comptes)
  if (!ban) {
    const allActive = await db.ban.findMany({
      where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: { player: true },
    });
    ban = allActive.find((b) => {
      try {
        const hits = JSON.parse(b.identifiersHit) as string[];
        // HWID blacklist : si le ban est hwidBan et qu'un hwid du joueur banni correspond
        if (b.hwidBan && hwid) {
          const bannedHwids = JSON.parse(b.player.hwids || "[]") as string[];
          if (bannedHwids.includes(hwid)) return true;
        }
        return hits.some((h) => provided.has(h));
      } catch {
        return false;
      }
    }) ?? null;
  }

  if (!ban) return Response.json({ banned: false });

  return Response.json({
    banned: true,
    ban: {
      type: ban.type,
      reason: ban.reason,
      expiresAt: ban.expiresAt,
      createdAt: ban.createdAt,
      isAuto: ban.isAuto,
      hwidBan: ban.hwidBan,
    },
  });
}
