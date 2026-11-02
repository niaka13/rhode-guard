/**
 * Insère 3 appels de démo dans la base courante (idempotent).
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const count = await db.appeal.count();
  if (count > 0) {
    console.log(`[APPEALS] ${count} appel(s) déjà présents — rien à faire.`);
    return;
  }
  const owner = await db.staff.findUnique({ where: { username: "owner" } });
  const admin = await db.staff.findUnique({ where: { username: "admin" } });
  if (!owner || !admin) throw new Error("staff démo absent");

  // Bans actifs (non révoqués) avec joueur
  const bans = await db.ban.findMany({
    where: { revokedAt: null },
    include: { player: true },
    orderBy: { createdAt: "asc" },
    take: 4,
  });
  const appealable = bans.filter((b) => !b.expiresAt || b.expiresAt > new Date());
  if (appealable.length < 3) throw new Error("pas assez de bans actifs");

  const now = Date.now();

  // 1) appel EN ATTENTE
  const a0 = appealable[0];
  await db.appeal.create({
    data: {
      banId: a0.id, playerName: a0.player.name, license: a0.player.license,
      statement: "Je jouais depuis mon nouveau PC, j'avais des chutes de FPS et un ping instable. Le speedhack détecté vient sûrement de ça, je peux fournir mes captures MSI Afterburner. Je joue sur ce serveur depuis 2 ans sans aucun souci.",
      contact: `${a0.player.name.toLowerCase().replace(/[^a-z0-9]/g, "")}#4420`,
      status: "PENDING", createdAt: new Date(now - 5 * 3600e3),
    },
  });
  await db.ban.update({ where: { id: a0.id }, data: { appealStatus: "PENDING" } });

  // 2) appel REJETÉ (décision motivée)
  const a1 = appealable[1];
  await db.appeal.create({
    data: {
      banId: a1.id, playerName: a1.player.name, license: a1.player.license,
      statement: "C'était un bug avec le garage du concessionnaire, j'ai sorti 4 véhicules d'affilée pour les tester avant achat. Le mécanicien du concession peut confirmer, c'était pendant mes heures de travail IG.",
      status: "REJECTED", handledById: admin.id,
      decisionNote: "Les logs montrent des sorties de garage hors heures d'ouverture du concession, récidive après avertissement verbal.",
      createdAt: new Date(now - 3 * 86400e3), decidedAt: new Date(now - 2 * 86400e3),
    },
  });
  await db.ban.update({ where: { id: a1.id }, data: { appealStatus: "REJECTED" } });

  // 3) appel ACCEPTÉ → sanction levée
  const a2 = appealable[2];
  await db.appeal.create({
    data: {
      banId: a2.id, playerName: a2.player.name, license: a2.player.license,
      statement: "Je comprends la détection mais j'étais en event militaire organisé par le staff, les tirs à longue distance étaient autorisés. Le pseudo Discord du staff présent peut confirmer.",
      status: "ACCEPTED", handledById: owner.id,
      decisionNote: "Event staff confirmé par l'organisateur, détections en contexte légitime. Sanction levée avec excuses.",
      createdAt: new Date(now - 5 * 86400e3), decidedAt: new Date(now - 4 * 86400e3),
    },
  });
  await db.ban.update({
    where: { id: a2.id },
    data: { appealStatus: "ACCEPTED", revokedById: owner.id, revokedAt: new Date(now - 4 * 86400e3), revokeReason: "Appel accepté: event staff confirmé" },
  });

  console.log(`[APPEALS] 3 appels insérés (PENDING: ${a0.player.name}, REJECTED: ${a1.player.name}, ACCEPTED: ${a2.player.name})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
