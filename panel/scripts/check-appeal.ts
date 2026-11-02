import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const appel = await db.appeal.findFirst({
    where: { statement: { contains: "farmer" } },
    include: { handledBy: true, ban: { include: { player: true } } },
  });
  if (!appel) {
    console.log("aucun appel xX_Sniper trouvé");
    return;
  }
  console.log("APPEL:", appel.status, "| statué par:", appel.handledBy?.username);
  console.log("BAN revoked:", appel.ban.revokedAt ? "OUI" : "non", "| motif:", appel.ban.revokeReason?.slice(0, 70));
  const auds = await db.auditLog.findMany({
    where: { action: { startsWith: "APPEAL" } },
    orderBy: { createdAt: "desc" },
    take: 4,
    include: { staff: true },
  });
  for (const a of auds) console.log("AUDIT:", a.action, "→", a.target, "| par:", a.staff?.username ?? "joueur (public)");
}

main().finally(() => db.$disconnect());
