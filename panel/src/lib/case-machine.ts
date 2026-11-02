/**
 * RHODE GUARD ULTIMATE — Machine à états des dossiers d'incident (§28)
 *
 * NOUVEAU(OPEN) → EN EXAMEN(REVIEWING) → ESCALADÉ(ESCALATED)
 *                → (FAUX POSITIF | SANCTION | REJETÉ) — clôtures
 * Réouverture: un état clos → REVIEWING, motif obligatoire, entrée d'audit.
 *
 * Le statut n'est JAMAIS un champ libre venant du navigateur: l'API valide
 * chaque transition avec canTransition() et exige un motif via requiresReason().
 * Ce module est volontairement PUR (aucune dépendance) → testable (scripts/).
 */

export const CASE_STATUSES = [
  "OPEN", // NOUVEAU (triage)
  "REVIEWING", // EN EXAMEN (attribué ou en cours d'analyse)
  "ESCALATED", // ESCALADÉ (avis requis / décision supérieure)
  "CLOSED_FP", // CLÔTURÉ — FAUX POSITIF
  "CLOSED_SANCTION", // CLÔTURÉ — SANCTION CONFIRMÉE
  "DISMISSED", // REJETÉ / LÉGITIME (pas assez de preuves, ou comportement légitime)
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const TERMINAL_STATUSES: readonly CaseStatus[] = [
  "CLOSED_FP",
  "CLOSED_SANCTION",
  "DISMISSED",
];

/** Transitions autorisées (machine à états explicite — refus par défaut). */
const TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  OPEN: ["REVIEWING", "ESCALATED", "CLOSED_FP", "CLOSED_SANCTION", "DISMISSED"],
  REVIEWING: ["OPEN", "ESCALATED", "CLOSED_FP", "CLOSED_SANCTION", "DISMISSED"],
  ESCALATED: ["REVIEWING", "CLOSED_FP", "CLOSED_SANCTION", "DISMISSED"],
  CLOSED_FP: ["REVIEWING"], // réouverture motivée uniquement
  CLOSED_SANCTION: ["REVIEWING"], // réouverture motivée uniquement (appel accepté p. ex.)
  DISMISSED: ["REVIEWING"], // réouverture motivée uniquement
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  OPEN: "OUVERT",
  REVIEWING: "EN REVUE",
  ESCALATED: "ESCALADÉ",
  CLOSED_FP: "CLÔTURÉ — FAUX POSITIF",
  CLOSED_SANCTION: "CLÔTURÉ — SANCTION",
  DISMISSED: "REJETÉ",
};

export function isCaseStatus(v: string): v is CaseStatus {
  return (CASE_STATUSES as readonly string[]).includes(v);
}

export function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** La transition from → to est-elle permise par la machine ? */
export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  const allowed = TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/** Motif obligatoire pour: escalade, toute clôture, toute réouverture. */
export function requiresReason(from: CaseStatus, to: CaseStatus): boolean {
  if (to === "ESCALATED") return true;
  if (isTerminal(to)) return true; // clôture
  if (isTerminal(from) && !isTerminal(to)) return true; // réouverture
  return false;
}

/** Liste des transitions possibles depuis un état (pour l'UI). */
export function allowedTargets(from: CaseStatus): CaseStatus[] {
  return [...TRANSITIONS[from]];
}

/** Message d'erreur stable, sans divulgation des règles internes. */
export function transitionError(from: CaseStatus, to: CaseStatus): string {
  if (from === to) return "Le dossier est déjà dans cet état";
  if (isTerminal(from)) return "Dossier clos — réouverture vers EN REVUE avec motif requise";
  return `Transition non permise: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`;
}
