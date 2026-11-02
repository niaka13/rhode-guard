/** Types partagés du panel RHODE GUARD ULTIMATE */

export type Role = "OWNER" | "ADMIN" | "MODERATOR" | "SUPPORT" | "AUDITOR";

export type StaffInfo = {
  id: string;
  username: string;
  role: Role;
};

export type StaffPermissions = {
  canBanTemp: boolean;
  canBanPerm: boolean;
  canHwidBan: boolean;
  canRevoke: boolean;
  canManageStaff: boolean;
  canManageWebhooks: boolean;
  canManageServers: boolean;
  canViewAudit: boolean;
  canMarkFalse: boolean;
  canViewCases: boolean;
  canManageCases: boolean;
  canCaseNotes: boolean;
  canViewSettings: boolean;
  canManageSettings: boolean;
  canViewAppeals: boolean;
  canDecideAppeals: boolean;
};

export type GuardMode = "OBSERVATION" | "AUDIT" | "ENFORCE";

export type PlayerRow = {
  id: string;
  name: string;
  license: string;
  riskScore: number;
  isOnline: boolean;
  playTimeMin: number;
  lastSeen: string;
  firstSeen: string;
  detectionCount: number;
  banCount: number;
};

export type DetectionRow = {
  id: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  source?: string;
  detectorVersion?: string;
  details: string;
  isFalse: boolean;
  caseId?: string | null;
  createdAt: string;
  player: { id: string; name: string; license: string; riskScore?: number };
  server?: { name: string } | null;
};

export type CaseRow = {
  id: string;
  ref: string;
  status: "OPEN" | "REVIEWING" | "ESCALATED" | "CLOSED_FP" | "CLOSED_SANCTION" | "DISMISSED";
  summary: string;
  appealStatus: "NONE" | "PENDING" | "ACCEPTED" | "REJECTED";
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
  player: { id: string; name: string; license: string; riskScore: number; isOnline: boolean };
  assignedTo: { id: string; username: string } | null;
  notes: { id: string }[];
  _count: { detections: number };
};

export type CaseTransitionRow = {
  id: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  createdAt: string;
  staff: { username: string; role: string } | null;
};

export type CaseDetail = CaseRow & {
  detections: DetectionRow[];
  notes: CaseNoteRow[];
  transitions: CaseTransitionRow[];
  machine?: { allowedTargets: string[] };
};

export type CaseNoteRow = {
  id: string;
  body: string;
  createdAt: string;
  staff: { username: string } | null;
};

export type BanRow = {
  id: string;
  type: "TEMP" | "PERM";
  reason: string;
  hwidBan: boolean;
  isAuto: boolean;
  appealStatus?: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  player: { id: string; name: string; license: string };
  createdBy: { username: string } | null;
  revokedBy: { username: string } | null;
};

export type AppealRow = {
  id: string;
  playerName: string;
  license: string;
  contact: string | null;
  statement: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  handledBy: string | null;
  ban: {
    id: string;
    type: "TEMP" | "PERM";
    reason: string;
    hwidBan: boolean;
    isAuto: boolean;
    createdAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    createdBy: string | null;
    player: { id: string; name: string; license: string; riskScore: number; isOnline: boolean };
  };
};

export type ServerRow = {
  id: string;
  name: string;
  apiKey: string;
  ip: string | null;
  version: string;
  onlinePlayers: number;
  maxPlayers: number;
  isOnline: boolean;
  healthState?: string;
  queueSize?: number;
  detectorsActive?: number;
  lastHeartbeat: string;
  createdAt: string;
};

export type RevisionRow = {
  id: string;
  revision: number;
  status: "DRAFT" | "VALIDATED" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "ROLLED_BACK";
  patch: string;
  diff: string;
  note: string | null;
  isEmergency: boolean;
  checksum: string;
  createdAt: string;
  validatedAt: string | null;
  approvedAt: string | null;
  activatedAt: string | null;
  author: { username: string; role: string } | null;
  approver: { username: string; role: string } | null;
};

export type DetectorSettings = {
  enabled: boolean;
  [key: string]: unknown;
};

export type RhodeSettingsData = {
  mode: GuardMode;
  detectors: Record<string, DetectorSettings>;
  autoSanction: {
    enabled: boolean;
    windowMinutes: number;
    criticalThreshold: number;
    autoBanHours: number;
  };
  retention: {
    detectionsDays: number;
    bansDays: number;
    auditDays: number;
  };
};

export type Stats = {
  onlinePlayers: number;
  detections24h: number;
  activeBans: number;
  totalPlayers: number;
  openCases: number;
  mode: GuardMode;
  servers: ServerRow[];
  byType: { type: string; count: number }[];
  topRisk: { id: string; name: string; riskScore: number; isOnline: boolean; license: string }[];
  recent: DetectionRow[];
  hourly: { hour: string; count: number }[];
};

export type StaffRow = {
  id: string;
  username: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  _count: { bansCreated: number; auditLogs: number };
};

export type AuditRow = {
  id: string;
  action: string;
  target: string | null;
  details: string;
  createdAt: string;
  staff: { username: string; role: string } | null;
};

export type WebhookRow = {
  id: string;
  name: string;
  url: string;
  events: string;
  isActive: boolean;
  lastStatus: string | null;
  lastFiredAt: string | null;
  createdAt: string;
};

export type LiveEvent = {
  id: string;
  kind: "detection" | "ban" | "unban" | "case";
  severity?: string;
  type?: string;
  playerName: string;
  reason?: string;
  at: string;
  isAuto?: boolean;
  ref?: string;
};

export const TYPE_LABELS: Record<string, string> = {
  SPEEDHACK: "Speedhack",
  TELEPORT: "Téléport",
  FLY_NOCLIP: "Fly/Noclip",
  SUPERJUMP: "Super saut",
  GODMODE: "Godmode",
  INVISIBLE: "Invisible",
  COLLISION_OFF: "Collision off",
  WEAPON_CADENCE: "Cadence tir",
  BLACKLIST_WEAPON: "Arme interdite",
  ONE_HIT_KILL: "Dégâts anormaux",
  VEHICLE_MODEL: "Véhicule interdit",
  VEHICLE_FLOOD: "Spawn véhicules",
  ECONOMY_ANOMALY: "Anomalie éco.",
  DUPLICATION: "Duplication",
  TELEMETRY_MISMATCH: "Télémétrie falsifiée",
  EVENT_FLOOD: "Flood d'événements",
  EVENT_INVALID: "Événement invalide",
};

export const SOURCE_LABELS: Record<string, string> = {
  CLIENT: "client",
  SERVEUR: "serveur",
  CROISEE: "croisée",
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Admin",
  MODERATOR: "Modérateur",
  SUPPORT: "Support",
  AUDITOR: "Auditeur",
};

export const CASE_STATUS_LABELS: Record<string, string> = {
  OPEN: "OUVERT",
  REVIEWING: "EN REVUE",
  ESCALATED: "ESCALADÉ",
  CLOSED_FP: "CLÔTURÉ — FAUX POSITIF",
  CLOSED_SANCTION: "CLÔTURÉ — SANCTION",
  DISMISSED: "REJETÉ",
};

export const APPEAL_LABELS: Record<string, string> = {
  NONE: "—",
  PENDING: "Appel en attente",
  ACCEPTED: "Appel accepté",
  REJECTED: "Appel rejeté",
};

export const MODE_LABELS: Record<GuardMode, string> = {
  OBSERVATION: "OBSERVATION",
  AUDIT: "AUDIT",
  ENFORCE: "ENFORCE",
};
