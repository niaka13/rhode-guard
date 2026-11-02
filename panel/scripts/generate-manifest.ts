/**
 * RHODE GUARD ULTIMATE — Générateur de MANIFEST (§31: chaîne de livraison)
 * Produit download/rhode_guard/MANIFEST.txt: somme SHA-256 de chaque fichier.
 * Le manifeste détecte toute modification/corruption d'artefact — ce n'est PAS
 * une signature cryptographique d'auteur.
 * Exécution: bun run scripts/generate-manifest.ts
 */
import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, relative } from "path";

const ROOT = "/home/z/my-project/download/rhode_guard";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT)
  .map((f) => relative(ROOT, f))
  .filter((f) => f !== "MANIFEST.txt")
  .sort();

const lines: string[] = [
  "RHODE GUARD ULTIMATE v2.1.0 — MANIFESTE DES ARTEFACTS",
  "Généré le " + new Date().toISOString(),
  "Sommes SHA-256 — détection de corruption/modification (pas une signature d'auteur).",
  "Vérification: sha256sum -c MANIFEST.txt (depuis le dossier rhode_guard/)",
  "",
  ...files.map((f) => {
    const hash = createHash("sha256").update(readFileSync(join(ROOT, f))).digest("hex");
    return `${hash}  ${f}`;
  }),
  "",
  `Total: ${files.length} fichier(s).`,
  "Aucun secret ne doit figurer dans ces artefacts (config/server.lua distribue des placeholders).",
];

writeFileSync(join(ROOT, "MANIFEST.txt"), lines.join("\n"), "utf8");
console.log(`[MANIFEST] ${files.length} fichiers → MANIFEST.txt`);
