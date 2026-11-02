/**
 * RHODE GUARD ULTIMATE — Exécuteur des tests Lua via wasmoon (Lua 5.4 WASM).
 * Charge les fichiers purs de la ressource dans un environnement Lua isolé,
 * monte un système de fichiers virtuel, puis exécute tests/run_tests.lua.
 */
import { LuaFactory } from "wasmoon";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = "/home/z/my-project/download/rhode_guard";

const files = [
  "shared/protocol.lua",
  "shared/schemas.lua",
  "shared/rulebook.lua",
  "shared/operations.lua",
  "server/services/RateLimit.lua",
  "server/services/LockManager.lua",
  "server/services/CombatGuard.lua", // aucune native au chargement — tests via mocks
  "tests/run_tests.lua",
  "tests/test_schemas.lua",
  "tests/test_ratelimit.lua",
  "tests/test_score.lua",
  "tests/test_operations.lua",
  "tests/test_locks_rulebook.lua",
  "tests/test_combat.lua",
];

async function main() {
  const factory = new LuaFactory();

  // Monte les fichiers dans le FS virtuel de wasmoon
  for (const f of files) {
    const content = readFileSync(join(ROOT, f), "utf8");
    await factory.mountFile(f, content);
    // wasmoon résout les chemins relatifs au "cwd" virtuel: monte aussi avec préfixe ./
    await factory.mountFile(`./${f}`, content);
  }

  const lua = await factory.createEngine();

  let output = "";
  const origPrint = await lua.global.get("print");
  await lua.global.set("print", (...args: unknown[]) => {
    const line = args.map(String).join("\t");
    output += line + "\n";
    console.log(line);
  });

  try {
    // exécute le runner (les dofile internes résolvent via le FS virtuel)
    await lua.doFile("tests/run_tests.lua");
  } catch (e) {
    // os.exit(1) se matérialise par une interruption — on capture l'état via la sortie
    const msg = e instanceof Error ? e.message : String(e);
    if (!/exit/i.test(msg)) {
      console.error("[RUNNER] erreur d'exécution:", msg);
      process.exit(2);
    }
  }

  const failedMatch = output.match(/(\d+) échec\(s\)/);
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : -1;
  if (failed > 0) {
    console.error(`[RUNNER] ${failed} test(s) Lua en échec`);
    process.exit(1);
  }
  if (failed === -1) {
    console.error("[RUNNER] résultat introuvable dans la sortie");
    process.exit(2);
  }
  console.log("[RUNNER] tous les tests Lua sont passés ✓");
  lua.global.close();
}

main().catch((e) => {
  console.error("[RUNNER] fatal:", e);
  process.exit(2);
});
