/**
 * RHODE GUARD ULTIMATE — Tests de la machine à états des dossiers (module pur).
 * Exécution: bun run scripts/test-case-machine.ts
 */
import {
  CASE_STATUSES,
  STATUS_LABELS,
  allowedTargets,
  canTransition,
  isCaseStatus,
  isTerminal,
  requiresReason,
  transitionError,
  type CaseStatus,
} from "../src/lib/case-machine";

let passed = 0;
let failed = 0;

function T(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  [OK]      ${name}`);
  } catch (e) {
    failed++;
    console.log(`  [ÉCHEC]   ${name}\n            → ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assertEq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg ?? "égalité"} (attendu: ${String(expected)}, obtenu: ${String(actual)})`);
  }
}

console.log("== Machine à états des dossiers — tests ==");

T("6 statuts définis avec libellés", () => {
  assertEq(CASE_STATUSES.length, 6);
  for (const s of CASE_STATUSES) {
    assertEq(typeof STATUS_LABELS[s], "string", `libellé manquant pour ${s}`);
  }
});

T("états terminaux: les 3 clôtures", () => {
  assertEq(isTerminal("CLOSED_FP"), true);
  assertEq(isTerminal("CLOSED_SANCTION"), true);
  assertEq(isTerminal("DISMISSED"), true);
  assertEq(isTerminal("OPEN"), false);
  assertEq(isTerminal("REVIEWING"), false);
  assertEq(isTerminal("ESCALATED"), false);
});

T("transition valide: OPEN → REVIEWING", () => {
  assertEq(canTransition("OPEN", "REVIEWING"), true);
  assertEq(requiresReason("OPEN", "REVIEWING"), false, "pas de motif requis");
});

T("transition invalide: CLOSED_FP → OPEN (réouverture uniquement vers REVIEWING)", () => {
  assertEq(canTransition("CLOSED_FP", "OPEN"), false);
  assertEq(canTransition("CLOSED_FP", "REVIEWING"), true);
  assertEq(canTransition("CLOSED_SANCTION", "REVIEWING"), true);
  assertEq(canTransition("DISMISSED", "REVIEWING"), true);
});

T("transition invalide: ESCALATED → OPEN", () => {
  assertEq(canTransition("ESCALATED", "OPEN"), false);
});

T("clôtures accessibles depuis tous les états non clos", () => {
  for (const from of ["OPEN", "REVIEWING", "ESCALATED"] as CaseStatus[]) {
    for (const to of ["CLOSED_FP", "CLOSED_SANCTION", "DISMISSED"] as CaseStatus[]) {
      assertEq(canTransition(from, to), true, `${from} → ${to}`);
      assertEq(requiresReason(from, to), true, `motif requis ${from} → ${to}`);
    }
  }
});

T("escalade: permise depuis OPEN/REVIEWING, motif requis", () => {
  assertEq(canTransition("OPEN", "ESCALATED"), true);
  assertEq(canTransition("REVIEWING", "ESCALATED"), true);
  assertEq(canTransition("ESCALATED", "ESCALATED"), false, "état identique");
  assertEq(requiresReason("OPEN", "ESCALATED"), true);
});

T("réouverture: motif toujours requis", () => {
  for (const from of ["CLOSED_FP", "CLOSED_SANCTION", "DISMISSED"] as CaseStatus[]) {
    assertEq(requiresReason(from, "REVIEWING"), true, `${from} → REVIEWING`);
  }
});

T("statuts inconnus rejetés (refus par défaut)", () => {
  assertEq(isCaseStatus("open"), false);
  assertEq(isCaseStatus("HACKED"), false);
  assertEq(isCaseStatus(""), false);
});

T("auto-transition rejetée partout", () => {
  for (const s of CASE_STATUSES) {
    assertEq(canTransition(s, s), false, `${s} → ${s}`);
  }
});

T("allowedTargets cohérent avec canTransition", () => {
  for (const from of CASE_STATUSES) {
    const targets = allowedTargets(from);
    for (const to of CASE_STATUSES) {
      assertEq(canTransition(from, to), targets.includes(to), `allowedTargets ${from}→${to}`);
    }
  }
});

T("aucun état non terminal n'est un cul-de-sac", () => {
  for (const s of CASE_STATUSES) {
    if (!isTerminal(s)) {
      assertEq(allowedTargets(s).length > 0, true, `${s} doit avoir au moins une sortie`);
    }
  }
});

T("messages d'erreur sobres, sans divulgation", () => {
  const msg = transitionError("CLOSED_FP", "OPEN");
  assertEq(typeof msg, "string");
  assertEq(msg.includes("SQL") || msg.includes("stack"), false, "pas de détail interne");
  assertEq(transitionError("OPEN", "OPEN").includes("déjà"), true);
});

console.log(`--------------------------------------------\n ${passed + failed} test(s), ${failed} échec(s)`);
if (failed > 0) process.exit(1);
console.log(" Machine à états: tous les tests passés ✓");
