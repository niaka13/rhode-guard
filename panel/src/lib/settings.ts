/**
 * RHODE GUARD ULTIMATE — Réglages persistants
 * Mode global (OBSERVATION / AUDIT / ENFORCE), seuils détecteurs,
 * auto-sanction, rétention. Servis à la ressource FiveM via /api/v1/config.
 */
import { db } from "@/lib/db";

export type GuardMode = "OBSERVATION" | "AUDIT" | "ENFORCE";

export type DetectorConfig = {
  enabled: boolean;
  [key: string]: unknown; // seuils spécifiques (maxSpeedOnFoot, etc.)
};

export type AutoSanctionConfig = {
  enabled: boolean;
  windowMinutes: number; // fenêtre glissante
  criticalThreshold: number; // N détections HIGH/CRITICAL dans la fenêtre
  autoBanHours: number; // durée du ban auto
};

export type RetentionConfig = {
  detectionsDays: number;
  bansDays: number;
  auditDays: number;
};

export type RhodeSettings = {
  mode: GuardMode;
  detectors: Record<string, DetectorConfig>;
  autoSanction: AutoSanctionConfig;
  retention: RetentionConfig;
};

export const MODE_DESCRIPTIONS: Record<GuardMode, string> = {
  OBSERVATION: "Journalisation seule — aucune action, idéal pour étalonner les seuils.",
  AUDIT: "Journalisation + alertes staff + dossiers automatiques — aucune sanction automatique.",
  ENFORCE: "Tout AUDIT + auto-sanction (selon configuration) + application des rollback/kick par la ressource.",
};

/** Valeurs par défaut — alignées avec config/shared.lua de la ressource. */
export const DEFAULT_SETTINGS: RhodeSettings = {
  mode: "AUDIT",
  detectors: {
    speedhack: { enabled: true, maxSpeedOnFoot: 12.5, maxSpeedSwim: 5.5, vehicleMargin: 1.25, strikes: 3, cooldown: 20 },
    teleport: { enabled: true, maxSpeedMs: 130, graceSpawnSec: 8, strikes: 2, cooldown: 15 },
    fly: { enabled: true, minAirTime: 3.5, maxFallSpeed: 90, strikes: 2, cooldown: 25 },
    noclip: { enabled: true, minTime: 2.0, strikes: 1, cooldown: 25 },
    superjump: { enabled: true, maxJumpVelocity: 9.0, strikes: 2, cooldown: 20 },
    godmode: { enabled: true, minDuration: 5, strikes: 2, cooldown: 30 },
    invisible: { enabled: true, minDuration: 3, strikes: 1, cooldown: 30 },
    combat: { enabled: true, maxKillsPerMin: 20, maxDamagePerHit: 200, strikes: 3, cooldown: 30 },
    vehicle: { enabled: true, maxSpawnsPerMin: 4, strikes: 2, cooldown: 30 },
    economy: { enabled: true, maxAmountPerOp: 500000, maxOpsPerMin: 10, strikes: 2, cooldown: 60 },
    telemetry: { enabled: true, mismatchTolerance: 0.35, strikes: 3, cooldown: 60 },
  },
  autoSanction: {
    enabled: true,
    windowMinutes: 10,
    criticalThreshold: 3,
    autoBanHours: 168, // 7 jours
  },
  retention: {
    detectionsDays: 90,
    bansDays: 365,
    auditDays: 180,
  },
};

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return patch as T;
  if (typeof patch !== "object" || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (k in out) out[k] = deepMerge(out[k], v);
  }
  return out as T;
}

/** Lit les réglages persistants en fusionnant sur les valeurs par défaut. */
export async function getSettings(): Promise<RhodeSettings> {
  const rows = await db.setting.findMany();
  let settings = DEFAULT_SETTINGS;
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (row.key === "mode") {
        const v = String(parsed);
        if (v === "OBSERVATION" || v === "AUDIT" || v === "ENFORCE") {
          settings = { ...settings, mode: v };
        }
      } else if (row.key in settings) {
        settings = deepMerge(settings, { [row.key]: parsed });
      }
    } catch {
      // valeur corrompue → on garde les défauts
    }
  }
  return settings;
}

/** Écrit un lot de réglages (mode, autoSanction, detectors.<module>...).
 *  Conservateur: pour chaque clé, FUSIONNE avec la valeur déjà stockée afin
 *  qu'un patch partiel n'écrase jamais des réglages précédents (ex: un détecteur
 *  coupé en urgence ne doit pas être réactivé par un patch de seuils). */
export async function saveSettings(patch: Record<string, unknown>): Promise<RhodeSettings> {
  const keys = Object.keys(patch).filter((k) => k === "mode" || k in DEFAULT_SETTINGS);
  for (const key of keys) {
    const existing = await db.setting.findUnique({ where: { key } });
    let value: unknown = patch[key];
    if (existing && key !== "mode") {
      try {
        value = deepMerge(JSON.parse(existing.value), patch[key]);
      } catch {
        // valeur stockée corrompue → on la remplace
      }
    }
    await db.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  }
  return getSettings();
}

/** Applique un SNAPSHOT COMPLET de réglages (retour arrière honnête §28):
 *  remplace les valeurs stockées — utilisé par le rollback d'une révision. */
export async function applySnapshot(snapshot: RhodeSettings): Promise<RhodeSettings> {
  for (const key of ["mode", "detectors", "autoSanction", "retention"] as const) {
    const value = snapshot[key];
    await db.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  }
  return getSettings();
}

/** Sanitize les seuils reçus: nombres bornés, booléens, pas d'injection de clés arbitraires. */
export function sanitizeSettingsPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.mode && ["OBSERVATION", "AUDIT", "ENFORCE"].includes(String(patch.mode))) {
    out.mode = String(patch.mode);
  }
  if (patch.autoSanction && typeof patch.autoSanction === "object") {
    const a = patch.autoSanction as Record<string, unknown>;
    out.autoSanction = {
      enabled: Boolean(a.enabled),
      windowMinutes: clampInt(a.windowMinutes, 1, 1440, 10),
      criticalThreshold: clampInt(a.criticalThreshold, 2, 50, 3),
      autoBanHours: clampInt(a.autoBanHours, 1, 24 * 365, 168),
    };
  }
  if (patch.detectors && typeof patch.detectors === "object") {
    const detectors: Record<string, DetectorConfig> = {};
    for (const [name, raw] of Object.entries(patch.detectors as Record<string, unknown>)) {
      if (!(name in DEFAULT_SETTINGS.detectors)) continue;
      if (raw === null || typeof raw !== "object") continue;
      const d = raw as Record<string, unknown>;
      const clean: DetectorConfig = {};
      // `enabled` n'est écrit QUE s'il est fourni explicitement:
      // un patch partiel (seuils seuls) ne doit jamais couper/activer un détecteur
      if (d.enabled !== undefined) clean.enabled = Boolean(d.enabled);
      for (const [k, v] of Object.entries(d)) {
        if (k === "enabled") continue;
        if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e6) clean[k] = v;
      }
      detectors[name] = clean;
    }
    out.detectors = detectors;
  }
  if (patch.retention && typeof patch.retention === "object") {
    const r = patch.retention as Record<string, unknown>;
    out.retention = {
      detectionsDays: clampInt(r.detectionsDays, 1, 3650, 90),
      bansDays: clampInt(r.bansDays, 1, 3650, 365),
      auditDays: clampInt(r.auditDays, 1, 3650, 180),
    };
  }
  return out;
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

/** Purge expirée selon la rétention (appelée périodiquement par l'ingest). */
export async function applyRetention(): Promise<void> {
  try {
    const s = await getSettings();
    const now = Date.now();
    await db.detection.deleteMany({
      where: { createdAt: { lt: new Date(now - s.retention.detectionsDays * 86400_000) }, isFalse: true },
    });
    await db.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(now - s.retention.auditDays * 86400_000) } },
    });
  } catch {
    // jamais bloquant
  }
}
