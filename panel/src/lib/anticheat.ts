/**
 * RHODE GUARD ULTIMATE — Helpers partagés (types, webhooks Discord, échelle de réponse)
 * Principe: une alerte ne bannit pas seule — l'auto-sanction n'agit qu'en mode ENFORCE
 * et conformément aux réglages validés par le staff (voir lib/settings.ts).
 */
import { db } from "@/lib/db";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const SEVERITY_WEIGHT: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 4,
  CRITICAL: 6,
};

export const TYPE_LABELS: Record<string, string> = {
  SPEEDHACK: "Speedhack",
  TELEPORT: "Téléportation",
  FLY_NOCLIP: "Fly / Noclip",
  SUPERJUMP: "Super saut",
  GODMODE: "Godmode",
  INVISIBLE: "Invisibilité",
  COLLISION_OFF: "Collision désactivée",
  WEAPON_CADENCE: "Cadence de tir anormale",
  BLACKLIST_WEAPON: "Arme interdite",
  ONE_HIT_KILL: "Dégâts anormaux",
  AIMBOT: "Visée anormale (aimbot)",
  NO_RECOIL: "Absence de recul",
  INFINITE_AMMO: "Munitions infinies",
  EXPLOSION_SPAM: "Explosions en rafale",
  VEHICLE_MODEL: "Véhicule interdit",
  VEHICLE_FLOOD: "Spawn de véhicules en rafale",
  ECONOMY_ANOMALY: "Anomalie économique",
  DUPLICATION: "Tentative de duplication",
  TELEMETRY_MISMATCH: "Télémétrie falsifiée",
  EVENT_FLOOD: "Flood d'événements réseau",
  EVENT_INVALID: "Événement invalide rejeté",
  SYSTEM_ALERT: "Alerte système (opérateur)",
};

/** Types acceptés par l'ingest (aligné sur shared/protocol.lua de la ressource). */
export const VALID_TYPES = Object.keys(TYPE_LABELS);

export const SOURCE_LABELS: Record<string, string> = {
  CLIENT: "Signal client",
  SERVEUR: "Vérif. serveur",
  CROISEE: "Vérif. croisée",
};

/** Couleur d'embed Discord selon sévérité. */
const SEVERITY_COLOR: Record<string, number> = {
  LOW: 0x33ff66,
  MEDIUM: 0xffcc00,
  HIGH: 0xff8800,
  CRITICAL: 0xff2222,
};

export function discordEmbed(opts: {
  title: string;
  description: string;
  severity?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
}) {
  return {
    embeds: [
      {
        title: `🛡️ RHODE GUARD — ${opts.title}`,
        description: opts.description,
        color: SEVERITY_COLOR[opts.severity ?? "LOW"] ?? 0x33ff66,
        fields: opts.fields ?? [],
        footer: { text: "RHODE GUARD ULTIMATE v2.0" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** Envoie les webhooks actifs abonnés à un événement. Ne lève jamais d'exception. */
export async function fireWebhooks(event: string, payload: () => ReturnType<typeof discordEmbed>) {
  try {
    const hooks = await db.webhook.findMany({ where: { isActive: true } });
    const targets = hooks.filter((h) => {
      try {
        return (JSON.parse(h.events) as string[]).includes(event);
      } catch {
        return false;
      }
    });
    await Promise.all(
      targets.map(async (h) => {
        try {
          const res = await fetch(h.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload()),
          });
          await db.webhook.update({
            where: { id: h.id },
            data: { lastStatus: res.ok ? "OK" : `ERREUR ${res.status}`, lastFiredAt: new Date() },
          });
        } catch {
          await db.webhook.update({
            where: { id: h.id },
            data: { lastStatus: "ERREUR réseau / URL invalide", lastFiredAt: new Date() },
          });
        }
      })
    );
  } catch {
    // jamais bloquant
  }
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** Génère une référence de dossier lisible: RG-2026-0007 */
export async function nextCaseRef(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RG-${year}-`;
  const last = await db.caseFile.findFirst({
    where: { ref: { startsWith: prefix } },
    orderBy: { ref: "desc" },
  });
  const n = last ? parseInt(last.ref.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}
