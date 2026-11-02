/**
 * RHODE GUARD ULTIMATE — Contrôle de syntaxe Lua (tous les fichiers de la ressource).
 * Charge chaque chunk avec load() SANS l'exécuter: détecte les erreurs de syntaxe
 * Lua 5.4 sans nécessiter les natives FiveM.
 */
import { LuaFactory } from "wasmoon";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = "/home/z/my-project/download/rhode_guard";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".lua")) out.push(full);
  }
  return out;
}

async function main() {
  const files = walk(ROOT);
  const factory = new LuaFactory();
  const lua = await factory.createEngine();

  let failed = 0;
  console.log(`[SYNTAXE] contrôle de ${files.length} fichiers Lua 5.4\n`);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const rel = relative(ROOT, file);
    // load() retourne (fn|nil, err) — n'exécute PAS le code
    const ok = lua.doStringSync(`
      local f, err = load(${JSON.stringify(src)}, ${JSON.stringify("@" + rel)})
      if f then return true else return false, err end
    `);
    const result = Array.isArray(ok) ? ok : [ok];
    if (result[0] === true || result[0] === undefined) {
      console.log(`  [OK]      ${rel}`);
    } else {
      failed++;
      console.log(`  [ÉCHEC]   ${rel}\n            → ${String(result[1] ?? "erreur inconnue")}`);
    }
  }
  console.log(`\n[SYNTAXE] ${files.length} fichier(s), ${failed} échec(s)`);
  if (failed > 0) process.exit(1);
  lua.global.close();
}

main().catch((e) => {
  console.error("[SYNTAXE] fatal:", e);
  process.exit(2);
});
