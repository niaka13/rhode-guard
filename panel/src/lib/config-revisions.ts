/**
 * RHODE GUARD ULTIMATE — Révisions de configuration (§18/§19/§28)
 *
 * Cycle: DRAFT → VALIDATED → APPROVED → ACTIVE (→ SUPERSEDED | ROLLED_BACK)
 * - un brouillon ne publie rien: il est validé (schéma), approuvé (personne
 *   différente de l'auteur, sauf OWNER), puis activé (confirmation renforcée) ;
 * - chaque activation supersede la précédente → rollback possible ;
 * - le chemin d'urgence (kill-switch direct du panel) applique immédiatement MAIS
 *   enregistre une révision ACTIVE isEmergency pour une piste d'audit complète.
 *
 * Checksum sha256: détection de corruption/divergence, PAS une preuve cryptographique.
 */
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { applySnapshot, getSettings, sanitizeSettingsPatch, saveSettings, type RhodeSettings } from "@/lib/settings";

export type RevisionStatus = "DRAFT" | "VALIDATED" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "ROLLED_BACK";

// ---- Aplatissement pour diff lisible: "detectors.speedhack.enabled": true ----
function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

/** Diff feuille-à-feuille entre réglages actuels et résultat du patch. */
export function computeDiff(current: RhodeSettings, cleanPatch: Record<string, unknown>): Record<string, { avant: unknown; apres: unknown }> {
  const before = flatten(current);
  const after = flatten(applyPreview(current, cleanPatch));
  const diff: Record<string, { avant: unknown; apres: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { avant: before[key] ?? null, apres: after[key] ?? null };
    }
  }
  return diff;
}

/** Aperçu: applique le patch sanitisé sur une copie (sans écrire en base). */
function applyPreview(current: RhodeSettings, cleanPatch: Record<string, unknown>): RhodeSettings {
  let merged: RhodeSettings = { ...current };
  for (const [key, value] of Object.entries(cleanPatch)) {
    if (key === "mode") {
      merged = { ...merged, mode: value as RhodeSettings["mode"] };
    } else if (key === "autoSanction" || key === "retention" || key === "detectors") {
      merged = {
        ...merged,
        [key]: {
          ...(merged[key] as Record<string, unknown>),
          ...(value as Record<string, unknown>),
        },
      } as RhodeSettings;
    }
  }
  return merged;
}

export function checksumOf(patch: Record<string, unknown>): string {
  const canonical = JSON.stringify(patch, Object.keys(patch).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

async function nextRevisionNumber(): Promise<number> {
  const last = await db.configRevision.findFirst({ orderBy: { revision: "desc" } });
  return (last?.revision ?? 0) + 1;
}

/** Crée un brouillon validé par schéma (ne publie RIEN). */
export async function createDraft(rawPatch: Record<string, unknown>, note: string | undefined, authorId: string) {
  const clean = sanitizeSettingsPatch(rawPatch);
  if (Object.keys(clean).length === 0) {
    return { error: "Aucune modification valide fournie" as const };
  }
  const current = await getSettings();
  const diff = computeDiff(current, clean);
  if (Object.keys(diff).length === 0) {
    return { error: "Aucun changement effectif par rapport à la configuration active" as const };
  }
  const revision = await db.configRevision.create({
    data: {
      revision: await nextRevisionNumber(),
      status: "DRAFT",
      authorId,
      patch: JSON.stringify(clean),
      diff: JSON.stringify(diff),
      note: note?.slice(0, 300) || null,
      checksum: checksumOf(clean),
    },
  });
  return { revision };
}

/** DRAFT → VALIDATED: re-valide le schéma et rafraîchit le diff vs config courante. */
export async function validateRevision(id: string, staffId: string) {
  const rev = await db.configRevision.findUnique({ where: { id } });
  if (!rev) return { error: "Révision introuvable" as const };
  if (rev.status !== "DRAFT") return { error: `Révision non modifiable (statut ${rev.status})` as const };

  const clean = sanitizeSettingsPatch(JSON.parse(rev.patch) as Record<string, unknown>);
  if (Object.keys(clean).length === 0) {
    return { error: "Le patch ne passe plus la validation de schéma" as const };
  }
  const current = await getSettings();
  const diff = computeDiff(current, clean);

  const updated = await db.configRevision.update({
    where: { id },
    data: {
      status: "VALIDATED",
      patch: JSON.stringify(clean),
      diff: JSON.stringify(diff),
      checksum: checksumOf(clean),
      validatedAt: new Date(),
    },
  });
  await audit(staffId, "CONFIG_VALIDATE", `révision #${rev.revision}`, { checksum: updated.checksum });
  return { revision: updated };
}

/** VALIDATED → APPROVED: séparation des tâches (approbateur ≠ auteur, sauf OWNER). */
export async function approveRevision(id: string, staffId: string, staffRole: string) {
  const rev = await db.configRevision.findUnique({ where: { id } });
  if (!rev) return { error: "Révision introuvable" as const };
  if (rev.status !== "VALIDATED") return { error: `Révision non approuvable (statut ${rev.status})` as const };
  if (rev.authorId === staffId && staffRole !== "OWNER") {
    return { error: "Séparation des tâches: l'auteur du brouillon ne peut pas l'approuver (OWNER excepté)" as const };
  }
  const updated = await db.configRevision.update({
    where: { id },
    data: { status: "APPROVED", approverId: staffId, approvedAt: new Date() },
  });
  await audit(staffId, "CONFIG_APPROVE", `révision #${rev.revision}`, { approbateur: staffRole });
  return { revision: updated };
}

/** APPROVED → ACTIVE: supersede la précédente, applique le patch, SNAPSHOTTE le
 *  résultat complet (le rollback restaure exactement cet état, pas un patch). */
export async function activateRevision(id: string, staffId: string) {
  const rev = await db.configRevision.findUnique({ where: { id } });
  if (!rev) return { error: "Révision introuvable" as const };
  if (rev.status !== "APPROVED") return { error: `Activation impossible (statut ${rev.status}, APPROVED requis)` as const };

  // le patch stocké est re-sanitirisé (défense en profondeur)
  const clean = sanitizeSettingsPatch(JSON.parse(rev.patch) as Record<string, unknown>);
  if (Object.keys(clean).length === 0) {
    return { error: "Patch invalide au moment de l'activation" as const };
  }

  const previousActive = await db.configRevision.findFirst({ where: { status: "ACTIVE" } });
  if (previousActive) {
    await db.configRevision.update({ where: { id: previousActive.id }, data: { status: "SUPERSEDED" } });
  }

  const settings = await saveSettings(clean);
  const updated = await db.configRevision.update({
    where: { id },
    data: { status: "ACTIVE", activatedAt: new Date(), snapshot: JSON.stringify(settings) },
  });
  await audit(staffId, "CONFIG_ACTIVATE", `révision #${rev.revision}`, { mode: settings.mode });
  return { revision: updated, settings };
}

/** Retour arrière EXACT (§28): restaure le SNAPSHOT de la révision ACTIVE
 *  précédente (ou les valeurs par défaut si aucun snapshot). */
export async function rollbackActive(staffId: string, reason: string) {
  const current = await db.configRevision.findFirst({ where: { status: "ACTIVE" }, orderBy: { activatedAt: "desc" } });
  if (!current) return { error: "Aucune révision active à annuler" as const };

  const previous = await db.configRevision.findFirst({
    where: { status: { in: ["SUPERSEDED", "ROLLED_BACK"] }, activatedAt: { not: null } },
    orderBy: { activatedAt: "desc" },
  });

  const settingsBefore = await getSettings();
  let settings: RhodeSettings;
  if (previous?.snapshot) {
    // restaure l'état COMPLET d'avant l'activation courante
    settings = await applySnapshot(JSON.parse(previous.snapshot) as RhodeSettings);
  } else {
    settings = await resetToDefaults();
  }

  await db.configRevision.update({ where: { id: current.id }, data: { status: "ROLLED_BACK" } });
  const revision = await db.configRevision.create({
    data: {
      revision: await nextRevisionNumber(),
      status: "ACTIVE",
      authorId: staffId,
      patch: previous ? previous.patch : "{}",
      diff: JSON.stringify(computeDiff(settingsBefore, JSON.parse(previous?.patch ?? "{}") as Record<string, unknown>)),
      snapshot: JSON.stringify(settings),
      note: `Retour arrière vers ${previous ? `révision #${previous.revision}` : "valeurs par défaut"} — ${reason.slice(0, 200)}`,
      isEmergency: false,
      checksum: checksumOf(JSON.parse(previous?.patch ?? "{}") as Record<string, unknown>),
      activatedAt: new Date(),
    },
  });
  await audit(staffId, "CONFIG_ROLLBACK", `révision #${current.revision}`, { vers: previous ? `#${previous.revision}` : "défauts" });
  return { revision, settings };
}

/** Chemin d'urgence (kill-switch direct): applique immédiatement + trace une révision
 *  ACTIVE avec snapshot complet (piste de gouvernance, jamais bloquante). */
export async function recordEmergencyRevision(rawPatch: Record<string, unknown>, staffId: string) {
  try {
    const clean = sanitizeSettingsPatch(rawPatch);
    if (Object.keys(clean).length === 0) return;

    // supersede les révisions ACTIVE existantes (une seule ACTIVE à la fois)
    await db.configRevision.updateMany({ where: { status: "ACTIVE" }, data: { status: "SUPERSEDED" } });

    const settings = await saveSettings(clean);
    await db.configRevision.create({
      data: {
        revision: await nextRevisionNumber(),
        status: "ACTIVE",
        authorId: staffId,
        patch: JSON.stringify(clean),
        diff: JSON.stringify(computeDiff(settings, {})),
        snapshot: JSON.stringify(settings),
        note: "Application directe (urgence / kill-switch)",
        isEmergency: true,
        checksum: checksumOf(clean),
        activatedAt: new Date(),
      },
    });
  } catch {
    // la révision d'urgence ne doit jamais bloquer l'application du kill-switch
  }
}

async function resetToDefaults(): Promise<RhodeSettings> {
  await db.setting.deleteMany();
  return getSettings();
}

async function audit(staffId: string, action: string, target: string, details: Record<string, unknown>) {
  await db.auditLog.create({
    data: { staffId, action, target, details: JSON.stringify(details) },
  }).catch(() => undefined);
}
