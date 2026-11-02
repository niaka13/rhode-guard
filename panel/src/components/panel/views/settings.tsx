"use client";

/**
 * Réglages: mode global (OBSERVATION/AUDIT/ENFORCE), kill-switch + seuils par
 * détecteur, auto-sanction (mode ENFORCE), rétention.
 * v2.1 (§28): les changements planifiés passent par le workflow de RÉVISION
 * (brouillon → validation → approbation séparée → activation confirmée).
 * Le bouton « application immédiate » reste disponible en URGENCE (kill-switch)
 * et produit lui aussi une révision tracée isEmergency.
 */
import { useCallback, useEffect, useState } from "react";
import { api, useRhode } from "../store";
import { Panel, LoadingLines, EmptyState, fmtDate } from "../terminal-ui";
import type { RhodeSettingsData, GuardMode, RevisionRow } from "@/lib/panel-types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Save, TriangleAlert, GitBranch, ChevronDown } from "lucide-react";

const MODES: { id: GuardMode; title: string; desc: string; cls: string }[] = [
  {
    id: "OBSERVATION",
    title: "OBSERVATION",
    desc: "Journalisation seule, aucune alerte ni action. Idéal pour étalonner les seuils sur ta population.",
    cls: "border-[rgba(53,224,255,0.5)] text-[#7ce8ff]",
  },
  {
    id: "AUDIT",
    title: "AUDIT",
    desc: "Journalise, ouvre des dossiers, alerte le staff (webhooks). Aucune sanction automatique — revue humaine obligatoire.",
    cls: "border-[rgba(255,176,0,0.55)] text-[#ffcf66]",
  },
  {
    id: "ENFORCE",
    title: "ENFORCE",
    desc: "Tout AUDIT + auto-sanction selon la configuration ci-dessous. Kick/rollback autorisés côté ressource.",
    cls: "border-[rgba(255,51,85,0.6)] text-[#ff5577]",
  },
];

const DETECTOR_LABELS: Record<string, string> = {
  speedhack: "Speedhack",
  teleport: "Téléportation",
  fly: "Fly",
  noclip: "Noclip / collision",
  superjump: "Super saut",
  godmode: "Godmode",
  invisible: "Invisibilité",
  combat: "Combat / dégâts",
  vehicle: "Véhicules",
  economy: "Économie",
  telemetry: "Télémétrie croisée",
};

const DETECTOR_FIELD_LABELS: Record<string, string> = {
  maxSpeedOnFoot: "Vitesse à pied max (m/s)",
  maxSpeedSwim: "Vitesse nage max (m/s)",
  vehicleMargin: "Marge véhicule (x)",
  strikes: "Strikes avant signalement",
  cooldown: "Cooldown (s)",
  maxSpeedMs: "Vitesse moyenne max (m/s)",
  graceSpawnSec: "Grâce après spawn (s)",
  minAirTime: "Temps en air min (s)",
  maxFallSpeed: "Chute max légitime (m/s)",
  minTime: "Durée min (s)",
  minDuration: "Durée min (s)",
  maxJumpVelocity: "Vélocité saut max (m/s)",
  maxKillsPerMin: "Kills max / min",
  maxDamagePerHit: "Dégâts max / coup",
  maxSpawnsPerMin: "Spawns max / min",
  maxAmountPerOp: "Montant max / opération ($)",
  maxOpsPerMin: "Opérations max / min",
  mismatchTolerance: "Tolérance d'écart (0-1)",
};

export function SettingsView() {
  const { toast } = useToast();
  const { permissions, setMode } = useRhode();
  const [settings, setSettings] = useState<RhodeSettingsData | null>(null);
  const [dirty, setDirty] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEnforce, setConfirmEnforce] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [showDraftForm, setShowDraftForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ settings: RhodeSettingsData }>("/api/admin/settings");
      setSettings(res.settings);
      setDirty(null);
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Chargement impossible", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const canManage = permissions?.canManageSettings ?? false;

  const patchLocal = (patch: Record<string, unknown>) => {
    setSettings((s) => (s ? ({ ...s, ...patch } as RhodeSettingsData) : s));
    setDirty((d) => ({ ...(d ?? {}), ...patch }));
  };

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const res = await api<{ settings: RhodeSettingsData }>("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(dirty),
      });
      setSettings(res.settings);
      setDirty(null);
      setMode(res.settings.mode);
      toast({
        title: "Réglages appliqués (urgence)",
        description: `Mode ${res.settings.mode} — révision d'urgence tracée, propagation < 60 s.`,
      });
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  /** Workflow gouverné (§28): les modifications en attente deviennent un BROUILLON. */
  const createDraft = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const res = await api<{ revision: RevisionRow }>("/api/admin/config/revisions", {
        method: "POST",
        body: JSON.stringify({ patch: dirty, note: draftNote.trim() || undefined }),
      });
      setDirty(null);
      setShowDraftForm(false);
      setDraftNote("");
      toast({
        title: `Brouillon #${res.revision.revision} créé`,
        description: "Aucun effet avant validation → approbation séparée → activation.",
      });
    } catch (e) {
      toast({ title: "Brouillon refusé", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return <LoadingLines rows={8} />;

  return (
    <div className="space-y-4">
      {/* Mode global */}
      <Panel title="Mode global">
        <div className="grid md:grid-cols-3 gap-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              disabled={!canManage || busy}
              onClick={() => {
                if (m.id === "ENFORCE" && settings.mode !== "ENFORCE") {
                  setConfirmEnforce(true);
                  return;
                }
                patchLocal({ mode: m.id });
              }}
              className={cn(
                "text-left border p-3 transition-all disabled:opacity-60",
                settings.mode === m.id
                  ? cn(m.cls, "bg-black/40 glow")
                  : "border-[rgba(0,255,65,0.15)] text-dim hover:border-[rgba(0,255,65,0.4)]"
              )}
              aria-pressed={settings.mode === m.id}
            >
              <span className="font-display text-lg block">{m.title}</span>
              <span className="text-[0.68rem] leading-snug block mt-1">{m.desc}</span>
              {settings.mode === m.id && <span className="text-[0.6rem] uppercase tracking-widest mt-2 block">● actif</span>}
            </button>
          ))}
        </div>
        {!canManage && (
          <p className="text-[0.68rem] text-dimmer mt-3">Lecture seule — seuls ADMIN et OWNER peuvent modifier les réglages.</p>
        )}
      </Panel>

      {/* Confirmation ENFORCE */}
      {confirmEnforce && (
        <div className="border border-[rgba(255,51,85,0.5)] bg-[rgba(255,51,85,0.06)] p-4" role="alertdialog" aria-label="Confirmation mode ENFORCE">
          <p className="glow-red font-display text-lg mb-2 flex items-center gap-2"><TriangleAlert size={18} /> Activer le mode ENFORCE ?</p>
          <p className="text-[0.72rem] text-dim mb-3">
            Les sanctions automatiques seront appliquées selon la configuration ci-dessous (ban temporaire
            {" "}{settings.autoSanction.autoBanHours / 24 >= 1 ? `${Math.round(settings.autoSanction.autoBanHours / 24)} jours` : `${settings.autoSanction.autoBanHours} h`}
            {" "}après {settings.autoSanction.criticalThreshold} détections majeures en {settings.autoSanction.windowMinutes} min).
            Vérifie d&apos;abord le taux de faux positifs en mode AUDIT.
          </p>
          <div className="flex gap-2">
            <button
              className="tbtn tbtn-danger px-4 h-10 min-h-10"
              onClick={() => { setConfirmEnforce(false); patchLocal({ mode: "ENFORCE" }); }}
            >
              confirmer ENFORCE
            </button>
            <button className="tbtn px-4 h-10 min-h-10" onClick={() => setConfirmEnforce(false)}>annuler</button>
          </div>
        </div>
      )}

      {/* Auto-sanction */}
      <Panel title="Auto-sanction (mode ENFORCE uniquement)">
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="flex items-center gap-2 text-sm text-[#7dffa8] sm:col-span-4">
            <input
              type="checkbox"
              checked={settings.autoSanction.enabled}
              disabled={!canManage || busy}
              onChange={(e) => patchLocal({ autoSanction: { ...settings.autoSanction, enabled: e.target.checked } })}
              className="accent-[#00ff41]"
            />
            activer la sanction automatique
          </label>
          <NumberField
            label="fenêtre (min)" value={settings.autoSanction.windowMinutes} min={1} max={1440}
            disabled={!canManage || busy}
            onChange={(v) => patchLocal({ autoSanction: { ...settings.autoSanction, windowMinutes: v } })}
          />
          <NumberField
            label="seuil (détections HIGH+)" value={settings.autoSanction.criticalThreshold} min={2} max={50}
            disabled={!canManage || busy}
            onChange={(v) => patchLocal({ autoSanction: { ...settings.autoSanction, criticalThreshold: v } })}
          />
          <NumberField
            label="durée ban auto (h)" value={settings.autoSanction.autoBanHours} min={1} max={8760}
            disabled={!canManage || busy}
            onChange={(v) => patchLocal({ autoSanction: { ...settings.autoSanction, autoBanHours: v } })}
          />
          <div className="text-[0.65rem] text-dimmer self-end leading-snug">
            Une alerte seule ne bannit jamais hors de ce cadre; les cas à fort impact restent en revue humaine.
          </div>
        </div>
      </Panel>

      {/* Détecteurs */}
      <Panel
        title="Détecteurs — kill-switch & seuils"
        right={<span className="text-[0.65rem] text-dimmer">propagés via /api/v1/config</span>}
      >
        {!canManage && <p className="text-[0.68rem] text-dimmer mb-3">Lecture seule.</p>}
        <div className="space-y-2">
          {Object.entries(settings.detectors).map(([key, det]) => (
            <div key={key} className="border border-[rgba(0,255,65,0.15)] p-2.5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className={cn("text-sm", det.enabled ? "glow-soft" : "text-dimmer line-through")}>
                  {DETECTOR_LABELS[key] ?? key}
                </span>
                <label className="flex items-center gap-2 text-[0.68rem] text-dim">
                  {det.enabled ? "actif" : "coupé"}
                  <input
                    type="checkbox"
                    checked={det.enabled}
                    disabled={!canManage || busy}
                    onChange={(e) => patchLocal({ detectors: { ...settings.detectors, [key]: { ...det, enabled: e.target.checked } } })}
                    className="accent-[#00ff41]"
                    aria-label={`Activer le détecteur ${DETECTOR_LABELS[key] ?? key}`}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(det)
                  .filter(([k, v]) => k !== "enabled" && typeof v === "number")
                  .map(([k, v]) => (
                    <label key={k} className="text-[0.62rem] text-dimmer">
                      {DETECTOR_FIELD_LABELS[k] ?? k}
                      <input
                        type="number"
                        step="0.1"
                        className="tinput w-24 px-2 py-1 text-[0.7rem] mt-0.5 block"
                        value={v as number}
                        disabled={!canManage || busy || !det.enabled}
                        onChange={(e) => patchLocal({
                          detectors: {
                            ...settings.detectors,
                            [key]: { ...det, [k]: Number(e.target.value) },
                          },
                        })}
                      />
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Rétention */}
      <Panel title="Rétention des données (politique de minimisation)">
        <div className="grid sm:grid-cols-3 gap-3 text-[0.72rem]">
          <div className="border border-[rgba(0,255,65,0.15)] p-2">
            <p className="text-dimmer uppercase text-[0.6rem]">Détections faux positifs</p>
            <p className="glow">{settings.retention.detectionsDays} jours</p>
          </div>
          <div className="border border-[rgba(0,255,65,0.15)] p-2">
            <p className="text-dimmer uppercase text-[0.6rem]">Bans & dossiers</p>
            <p className="glow">{settings.retention.bansDays} jours</p>
          </div>
          <div className="border border-[rgba(0,255,65,0.15)] p-2">
            <p className="text-dimmer uppercase text-[0.6rem]">Journal d&apos;audit</p>
            <p className="glow">{settings.retention.auditDays} jours</p>
          </div>
        </div>
        <p className="text-[0.65rem] text-dimmer mt-2">
          Les détections non marquées faux positif sont conservées comme base de preuve; les identifiants
          complets ne sont visibles que dans les fiches nécessitant ton rôle.
        </p>
      </Panel>

      {/* Révisions de configuration (§28) */}
      {canManage && <RevisionsPanel onActivated={(s) => { setSettings(s); setMode(s.mode); }} />}

      {/* Barre d'action: workflow gouverné (recommandé) vs urgence */}
      {dirty && canManage && (
        <div className="sticky bottom-3 flex flex-col sm:flex-row justify-end gap-2">
          {showDraftForm && (
            <div className="tpanel p-3 flex flex-col sm:flex-row gap-2 w-full sm:w-auto" role="dialog" aria-label="Note du brouillon">
              <input
                className="tinput flex-1 px-3 py-2 text-sm"
                placeholder="note du brouillon: ex. recalibrage téléport après audit"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                aria-label="Note du brouillon"
              />
              <div className="flex gap-2">
                <button className="tbtn px-4 glow" onClick={createDraft} disabled={busy}>créer le brouillon</button>
                <button className="tbtn px-4" onClick={() => setShowDraftForm(false)}>annuler</button>
              </div>
            </div>
          )}
          {!showDraftForm && (
            <>
              <button
                className="tbtn px-5 h-12 min-h-12 font-display glow shadow-[0_0_20px_rgba(0,255,65,0.35)]"
                onClick={() => setShowDraftForm(true)}
                disabled={busy}
              >
                <span className="inline-flex items-center gap-2"><GitBranch size={16} /> PROPOSER EN RÉVISION</span>
              </button>
              <button
                className="tbtn tbtn-amber px-5 h-12 min-h-12 font-display"
                onClick={save}
                disabled={busy}
                title="Kill-switch: application immédiate tracée comme urgence"
              >
                {busy ? "..." : "URGENCE — APPLIQUER DIRECTEMENT"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Historique et actions du workflow de révision (brouillon → validation → approbation → activation). */
function RevisionsPanel({ onActivated }: { onActivated: (s: RhodeSettingsData) => void }) {
  const { toast } = useToast();
  const { staff } = useRhode();
  const [revisions, setRevisions] = useState<RevisionRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<string | null>(null);
  const [rollbackReason, setRollbackReason] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ revisions: RevisionRow[] }>("/api/admin/config/revisions");
      setRevisions(res.revisions);
    } catch {
      setRevisions([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const action = async (id: string, act: string, body?: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ revision: RevisionRow; settings?: RhodeSettingsData }>(
        `/api/admin/config/revisions/${id}/${act}`,
        { method: "POST", body: JSON.stringify(body ?? {}) }
      );
      toast({ title: `Révision #${res.revision.revision} → ${res.revision.status}` });
      setConfirmActivate(null);
      setRollbackReason(null);
      if (res.settings) onActivated(res.settings);
      await load();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    if (!rollbackReason || rollbackReason.trim().length < 4 || busy || !revisions) return;
    const active = revisions.find((r) => r.status === "ACTIVE");
    if (!active) return;
    setBusy(true);
    try {
      const res = await api<{ revision: RevisionRow; settings: RhodeSettingsData }>(
        `/api/admin/config/revisions/${active.id}/rollback`,
        { method: "POST", body: JSON.stringify({ reason: rollbackReason.trim() }) }
      );
      toast({ title: `Retour arrière effectué (nouvelle révision #${res.revision.revision})` });
      setRollbackReason(null);
      onActivated(res.settings);
      await load();
    } catch (e) {
      toast({ title: "Rollback refusé", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: "BROUILLON", VALIDATED: "VALIDÉE", APPROVED: "APPROUVÉE",
    ACTIVE: "ACTIVE", SUPERSEDED: "REMPLACÉE", ROLLED_BACK: "ANNULÉE",
  };
  const STATUS_STYLES: Record<string, string> = {
    DRAFT: "border-[rgba(125,255,168,0.3)] text-dim",
    VALIDATED: "border-[rgba(53,224,255,0.4)] text-[#7ce8ff]",
    APPROVED: "border-[rgba(255,176,0,0.5)] text-[#ffcf66]",
    ACTIVE: "border-[rgba(0,255,65,0.5)] text-[#7dffa8]",
    SUPERSEDED: "border-[rgba(125,255,168,0.2)] text-dimmer",
    ROLLED_BACK: "border-[rgba(255,51,85,0.4)] text-[#ff5577]",
  };

  if (revisions === null) return <LoadingLines rows={4} />;

  const hasActive = revisions.some((r) => r.status === "ACTIVE");

  return (
    <Panel
      title="Révisions de configuration"
      right={<span className="text-[0.65rem] text-dimmer">brouillon → validation → approbation → activation</span>}
    >
      {revisions.length === 0 && (
        <EmptyState text="Aucune révision — les changements urgents (kill-switch) apparaîtront ici aussi" />
      )}
      <div className="space-y-2 max-h-96 overflow-y-auto term-scroll pr-1">
        {revisions.map((r) => {
          const isMine = r.author?.username === staff?.username;
          const canApprove = r.status === "VALIDATED" && !(isMine && staff?.role !== "OWNER");
          return (
            <div key={r.id} className="border border-[rgba(0,255,65,0.15)] p-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[0.72rem]">
                <span className="glow-cyan font-display">#{r.revision}</span>
                <span className={cn("border px-1.5 py-0.5 text-[0.6rem] tracking-wider", STATUS_STYLES[r.status])}>
                  {STATUS_LABELS[r.status]}
                </span>
                {r.isEmergency && <span className="glow-amber text-[0.6rem] border border-[rgba(255,176,0,0.4)] px-1">URGENCE</span>}
                <span className="text-dimmer">
                  {r.author?.username ?? "?"}{r.approver && ` · approuvée par ${r.approver.username}`}
                </span>
                <span className="text-dimmer ml-auto">{fmtDate(r.createdAt)}</span>
                <button
                  className="tbtn px-2 h-7 min-h-7"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  aria-label="Voir le diff"
                >
                  <ChevronDown size={12} className={cn("transition-transform", expanded === r.id && "rotate-180")} /> diff
                </button>
              </div>
              {r.note && <p className="text-[0.68rem] text-dim mt-1">{r.note}</p>}

              {expanded === r.id && (
                <pre className="mt-2 text-[0.65rem] text-[#7dffa8] bg-black/60 border border-[rgba(0,255,65,0.2)] p-2 max-h-40 overflow-y-auto term-scroll whitespace-pre-wrap">
                  {Object.entries((JSON.parse(r.diff || "{}") as Record<string, { avant: unknown; apres: unknown }>) ?? {})
                    .map(([k, v]) => `${k}: ${JSON.stringify(v.avant)} → ${JSON.stringify(v.apres)}`)
                    .join("\n") || "aucun changement effectif"}
                </pre>
              )}

              <div className="flex gap-2 mt-2">
                {r.status === "DRAFT" && (
                  <button className="tbtn px-3 h-8 min-h-8 text-[0.65rem]" disabled={busy} onClick={() => action(r.id, "validate")}>
                    valider
                  </button>
                )}
                {canApprove && (
                  <button className="tbtn px-3 h-8 min-h-8 text-[0.65rem]" disabled={busy} onClick={() => action(r.id, "approve")}>
                    approuver{isMine ? " (OWNER requis)" : ""}
                  </button>
                )}
                {r.status === "APPROVED" && (
                  <button
                    className="tbtn tbtn-danger px-3 h-8 min-h-8 text-[0.65rem]"
                    disabled={busy}
                    onClick={() => setConfirmActivate(confirmActivate === r.id ? null : r.id)}
                  >
                    activer...
                  </button>
                )}
                {confirmActivate === r.id && (
                  <div className="flex items-center gap-2" role="alertdialog" aria-label="Confirmation d'activation">
                    <span className="text-[0.65rem] text-[#ffcf66]">confirmation renforcée:</span>
                    <button className="tbtn tbtn-danger px-3 h-8 min-h-8 text-[0.65rem]" disabled={busy} onClick={() => action(r.id, "activate", { confirm: "ACTIVER" })}>
                      taper ACTIVER
                    </button>
                    <button className="tbtn px-2 h-8 min-h-8 text-[0.65rem]" onClick={() => setConfirmActivate(null)}>annuler</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasActive && (
        <div className="mt-3 border-t border-[rgba(0,255,65,0.15)] pt-3">
          {rollbackReason === null ? (
            <button className="tbtn tbtn-amber px-3 h-9 min-h-9 text-[0.68rem]" disabled={busy} onClick={() => setRollbackReason("")}>
              retour arrière (ré-active la révision précédente)
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2" role="dialog" aria-label="Motif du retour arrière">
              <input
                className="tinput flex-1 px-3 py-2 text-sm"
                placeholder="motif obligatoire du retour arrière..."
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                aria-label="Motif du retour arrière"
              />
              <div className="flex gap-2">
                <button className="tbtn tbtn-amber px-4" disabled={busy || rollbackReason.trim().length < 4} onClick={rollback}>
                  confirmer rollback
                </button>
                <button className="tbtn px-4" onClick={() => setRollbackReason(null)}>annuler</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function NumberField({
  label, value, min, max, disabled, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-[0.62rem] text-dimmer">
      {label}
      <input
        type="number"
        className="tinput w-full px-2 py-1.5 text-[0.75rem] mt-0.5 block"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
