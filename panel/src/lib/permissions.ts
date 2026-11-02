/**
 * RHODE GUARD ULTIMATE — Matrice de permissions par rôle (RBAC)
 * Principe: refus par défaut, moindre privilège, contrôle côté serveur uniquement.
 *
 * Mapping vers les rôles métier de la spécification (§20):
 *   OWNER     → Administrateur (gestion rôles + changements critiques)
 *   ADMIN     → Ingénieur sécurité / Administrateur délégué
 *   MODERATOR → Modérateur / Analyste (dossiers, sanctions bornées)
 *   SUPPORT   → Observateur / Analyste lecture (aucune mutation)
 *   AUDITOR   → Auditeur (journal d'audit et rapports minimisés, sans mutation)
 */
export const ROLES = ["OWNER", "ADMIN", "MODERATOR", "SUPPORT", "AUDITOR"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  // Consultation
  VIEW_DASHBOARD: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT", "AUDITOR"],
  VIEW_PLAYERS: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"],
  VIEW_DETECTIONS: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT", "AUDITOR"],
  VIEW_BANS: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT", "AUDITOR"],
  VIEW_CASES: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT", "AUDITOR"],
  // Enquête
  MARK_FALSE_POSITIVE: ["OWNER", "ADMIN", "MODERATOR"],
  MANAGE_CASES: ["OWNER", "ADMIN", "MODERATOR"],
  CASE_NOTES: ["OWNER", "ADMIN", "MODERATOR"],
  // Sanctions
  CREATE_BAN_TEMP: ["OWNER", "ADMIN", "MODERATOR"],
  CREATE_BAN_PERM: ["OWNER", "ADMIN"],
  HWID_BAN: ["OWNER", "ADMIN"],
  REVOKE_BAN: ["OWNER", "ADMIN"],
  // Appels de sanction (joueurs bannis)
  VIEW_APPEALS: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT", "AUDITOR"],
  DECIDE_APPEALS: ["OWNER", "ADMIN", "MODERATOR"],
  // Administration
  VIEW_AUDIT: ["OWNER", "ADMIN", "AUDITOR"],
  MANAGE_STAFF: ["OWNER"],
  MANAGE_WEBHOOKS: ["OWNER", "ADMIN"],
  MANAGE_SERVERS: ["OWNER"],
  VIEW_SETTINGS: ["OWNER", "ADMIN", "MODERATOR", "SUPPORT", "AUDITOR"],
  MANAGE_SETTINGS: ["OWNER", "ADMIN"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** Durée max (heures) d'un ban temporaire selon le rôle. */
export const MAX_TEMP_BAN_HOURS: Record<Role, number> = {
  OWNER: 24 * 365,
  ADMIN: 24 * 90,
  MODERATOR: 24 * 7,
  SUPPORT: 0,
  AUDITOR: 0,
};

export function can(role: string, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[];
  return allowed.includes(role);
}
