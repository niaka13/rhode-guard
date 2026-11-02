"use client";

/** Dossiers d'incident: file de revue, machine à états motivée (§28), notes, appels */
import { useCallback, useEffect, useState } from "react";
import { api, useRhode } from "../store";
import { Panel, LoadingLines, EmptyState, SeverityBadge, TypeBadge, fmtDate, fmtRelative } from "../terminal-ui";
import type { CaseRow, CaseDetail, CaseNoteRow, DetectionRow, StaffRow } from "@/lib/panel-types";
import { CASE_STATUS_LABELS, APPEAL_LABELS } from "@/lib/panel-types";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Search, X, History } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { v: "", l: "Tous" },
  { v: "OPEN", l: "Ouverts" },
  { v: "REVIEWING", l: "En revue" },
  { v: "ESCALATED", l: "Escaladés" },
  { v: "CLOSED_FP", l: "Faux positifs" },
  { v: "CLOSED_SANCTION", l: "Sanctionnés" },
  { v: "DISMISSED", l: "Rejetés" },
];

const STATUS_STYLES: Record<string, string> = {
  OPEN: "border-[rgba(0,255,65,0.4)] text-[#7dffa8]",
  REVIEWING: "border-[rgba(255,176,0,0.5)] text-[#ffcf66]",
  ESCALATED: "border-[rgba(255,110,0,0.6)] text-[#ff9448]",
  CLOSED_FP: "border-[rgba(53,224,255,0.4)] text-[#7ce8ff]",
  CLOSED_SANCTION: "border-[rgba(255,51,85,0.6)] text-[#ff5577]",
  DISMISSED: "border-[rgba(125,255,168,0.2)] text-dim",
};

// statuts nécessitant un motif (miroir de requiresReason côté serveur — le serveur reste juge)
function needsReason(from: string, to: string): boolean {
  if (to === "ESCALATED") return true;
  if (["CLOSED_FP", "CLOSED_SANCTION", "DISMISSED"].includes(to)) return true;
  if (["CLOSED_FP", "CLOSED_SANCTION", "DISMISSED"].includes(from)) return true; // réouverture
  return false;
}

type StaffOption = Pick<StaffRow, "id" | "username" | "role">;

export function CasesView() {
  const { toast } = useToast();
  const { eventTick, permissions } = useRhode();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ cases: CaseRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (search.trim()) params.set("q", search.trim());
      params.set("take", "50");
      setData(await api(`/api/admin/cases?${params}`));
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Chargement impossible", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [status, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (eventTick > 0) load();
  }, [eventTick]);

  return (
    <div className="space-y-4">
      <Panel
        title="Dossiers d'incident"
        right={<span className="text-[0.7rem] text-dim">{data ? `${data.cases.length} dossier(s)` : "..."}</span>}
      >
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden="true" />
            <input
              className="tinput w-full pl-9 pr-3 text-sm"
              placeholder="recherche: pseudo du joueur..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              aria-label="Rechercher un dossier par joueur"
            />
          </div>
          <div className="flex gap-1 flex-wrap" role="group" aria-label="Filtre par statut">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.v}
                onClick={() => { setStatus(f.v); setPage(1); }}
                className={cn("tbtn px-3 h-11", status === f.v && "bg-[rgba(0,255,65,0.16)] glow")}
              >
                {f.l}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <LoadingLines rows={6} />
        ) : !data || data.cases.length === 0 ? (
          <EmptyState text="Aucun dossier pour ces filtres" />
        ) : (
          <div className="overflow-x-auto term-scroll">
            <table className="ttable">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Joueur</th>
                  <th>Statut</th>
                  <th className="hidden md:table-cell">Résumé</th>
                  <th className="hidden sm:table-cell">Dét.</th>
                  <th className="hidden lg:table-cell">Assigné</th>
                  <th className="hidden lg:table-cell">MAJ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map((c) => (
                  <tr key={c.id}>
                    <td className="glow-cyan whitespace-nowrap">{c.ref}</td>
                    <td>
                      <span className={c.player.isOnline ? "text-[#00ff41] mr-1" : "text-dimmer mr-1"}>●</span>
                      <span className="glow-soft">{c.player.name}</span>
                    </td>
                    <td>
                      <span className={cn("inline-block border px-1.5 py-0.5 text-[0.6rem] tracking-wider whitespace-nowrap", STATUS_STYLES[c.status])}>
                        {CASE_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="hidden md:table-cell text-dim max-w-52 truncate" title={c.summary}>{c.summary || "—"}</td>
                    <td className="hidden sm:table-cell text-[#ffcf66]">{c._count.detections}</td>
                    <td className="hidden lg:table-cell text-dim">{c.assignedTo?.username ?? "—"}</td>
                    <td className="hidden lg:table-cell text-dim whitespace-nowrap">{fmtRelative(c.updatedAt)}</td>
                    <td>
                      <button className="tbtn px-2 py-1 h-8 min-h-8" onClick={() => setDetailId(c.id)}>ouvrir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.cases.length >= 50 && (
          <div className="flex items-center justify-center gap-3 mt-4 text-sm">
            <button className="tbtn px-3 h-9 min-h-9 inline-flex items-center gap-1" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={14} /> prec
            </button>
            <span className="text-dim">{page}</span>
            <button className="tbtn px-3 h-9 min-h-9 inline-flex items-center gap-1" onClick={() => setPage((p) => p + 1)}>
              suiv <ChevronRight size={14} />
            </button>
          </div>
        )}
      </Panel>

      {detailId && (
        <CaseDetailDialog
          caseId={detailId}
          onClose={() => setDetailId(null)}
          canManage={permissions?.canManageCases ?? false}
          canNote={permissions?.canCaseNotes ?? false}
        />
      )}
    </div>
  );
}

function CaseDetailDialog({
  caseId, onClose, canManage, canNote,
}: {
  caseId: string;
  onClose: () => void;
  canManage: boolean;
  canNote: boolean;
}) {
  const { toast } = useToast();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const loadCase = useCallback(async (id: string) => {
    try {
      const r = await api<{ case: CaseDetail; machine?: { allowedTargets: string[] } }>(`/api/admin/cases/${id}`);
      // la machine à états est retournée au niveau racine — on la greffe sur le dossier
      setCaseData({ ...r.case, machine: r.machine });
    } catch {
      setCaseData(null);
    }
  }, []);

  useEffect(() => {
    if (caseId) loadCase(caseId);
  }, [caseId, loadCase]);

  useEffect(() => {
    if (!canManage) return;
    api<{ staff: StaffOption[] }>("/api/admin/cases/staff-options")
      .then((r) => setStaffOptions(r.staff))
      .catch(() => setStaffOptions([]));
  }, [canManage]);

  const patch = async (body: Record<string, unknown>) => {
    if (!caseData || busy) return;
    setBusy(true);
    try {
      await api(`/api/admin/cases/${caseData.id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast({ title: "Dossier mis à jour", description: caseData.ref });
      setPendingStatus(null);
      setReason("");
      await loadCase(caseData.id);
    } catch (e) {
      toast({ title: "Transition refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!caseData || !note.trim() || busy) return;
    setBusy(true);
    try {
      await api(`/api/admin/cases/${caseData.id}/notes`, { method: "POST", body: JSON.stringify({ body: note.trim() }) });
      setNote("");
      toast({ title: "Note ajoutée", description: caseData.ref });
      await loadCase(caseData.id);
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const allowedTargets = caseData?.machine?.allowedTargets ?? [];

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="Dossier d'incident"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tpanel p-5 w-full max-w-3xl my-4">
        {!caseData ? (
          <LoadingLines rows={8} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display text-2xl glow-cyan">{caseData.ref}</h3>
                <p className="text-[0.68rem] text-dimmer">
                  {caseData.player.name} — risque {caseData.player.riskScore}/100 — ouvert {fmtDate(caseData.openedAt)}
                </p>
              </div>
              <button className="tbtn px-2 h-9 min-h-9" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
            </div>

            {/* Actions (MODERATOR+) — transitions guidées par la machine à états serveur */}
            {canManage && (
              <div className="grid sm:grid-cols-3 gap-2 mb-4 text-[0.7rem]">
                <div>
                  <label htmlFor="case-status" className="text-dimmer uppercase text-[0.6rem] block mb-1">statut</label>
                  <select
                    id="case-status"
                    className="tinput w-full px-2 py-1.5"
                    value={caseData.status}
                    disabled={busy || pendingStatus !== null}
                    onChange={(e) => {
                      const to = e.target.value;
                      if (needsReason(caseData.status, to)) {
                        setPendingStatus(to);
                        setReason("");
                      } else {
                        patch({ status: to });
                      }
                    }}
                  >
                    <option value={caseData.status}>{CASE_STATUS_LABELS[caseData.status]} (actuel)</option>
                    {allowedTargets.map((s) => (
                      <option key={s} value={s}>{CASE_STATUS_LABELS[s] ?? s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="case-assign" className="text-dimmer uppercase text-[0.6rem] block mb-1">assigné à</label>
                  <select
                    id="case-assign"
                    className="tinput w-full px-2 py-1.5"
                    value={caseData.assignedTo?.id ?? ""}
                    onChange={(e) => patch({ assignedToId: e.target.value || null })}
                    disabled={busy || pendingStatus !== null}
                  >
                    <option value="">— non assigné —</option>
                    {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.username} ({s.role})</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="case-appeal" className="text-dimmer uppercase text-[0.6rem] block mb-1">appel</label>
                  <select
                    id="case-appeal"
                    className="tinput w-full px-2 py-1.5"
                    value={caseData.appealStatus}
                    onChange={(e) => patch({ appealStatus: e.target.value })}
                    disabled={busy || pendingStatus !== null}
                  >
                    {Object.entries(APPEAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Motif obligatoire (clôture / escalade / réouverture) */}
            {pendingStatus && (
              <div className="border border-[rgba(255,176,0,0.5)] bg-[rgba(255,176,0,0.05)] p-3 mb-4" role="alertdialog" aria-label="Motif de transition">
                <p className="glow-amber text-[0.72rem] mb-2">
                  Motif obligatoire — {CASE_STATUS_LABELS[caseData.status]} → {CASE_STATUS_LABELS[pendingStatus] ?? pendingStatus}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    className="tinput flex-1 px-3 py-2 text-sm"
                    placeholder="ex: recoupement télémétrie confirmé, appel accepté..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-label="Motif de la transition"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      className="tbtn px-4"
                      disabled={busy || reason.trim().length < 4}
                      onClick={() => patch({ status: pendingStatus, reason: reason.trim() })}
                    >
                      confirmer
                    </button>
                    <button className="tbtn px-4" onClick={() => { setPendingStatus(null); setReason(""); }}>annuler</button>
                  </div>
                </div>
              </div>
            )}

            {/* Détections du dossier */}
            <h4 className="text-[0.65rem] uppercase tracking-[0.18em] text-dim mb-2">
              Détections ({caseData.detections.length})
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto term-scroll mb-4">
              {caseData.detections.length === 0 && <EmptyState text="Aucune détection" />}
              {caseData.detections.map((d: DetectionRow) => (
                <div key={d.id} className="flex flex-wrap items-center gap-2 text-[0.7rem] border-b border-[rgba(0,255,65,0.08)] pb-1">
                  <span className="text-dimmer">{fmtDate(d.createdAt)}</span>
                  <SeverityBadge severity={d.severity} />
                  <TypeBadge type={d.type} />
                  <span className="text-dim">{d.confidence}%</span>
                  <span
                    className={cn(
                      "text-[0.6rem] uppercase",
                      d.source === "SERVEUR" ? "glow" : d.source === "CROISEE" ? "glow-cyan" : "text-dimmer"
                    )}
                  >
                    {d.source === "SERVEUR" ? "serveur" : d.source === "CROISEE" ? "croisée" : "client"}
                  </span>
                  {d.isFalse && <span className="text-dimmer line-through">FAUX POSITIF</span>}
                </div>
              ))}
            </div>

            {/* Historique des transitions (machine à états §28) */}
            <h4 className="text-[0.65rem] uppercase tracking-[0.18em] text-dim mb-2 flex items-center gap-1.5">
              <History size={12} aria-hidden="true" /> Historique ({caseData.transitions?.length ?? 0})
            </h4>
            <div className="space-y-1 max-h-36 overflow-y-auto term-scroll mb-4">
              {(!caseData.transitions || caseData.transitions.length === 0) && (
                <EmptyState text="Aucune transition enregistrée" />
              )}
              {caseData.transitions?.map((t) => (
                <div key={t.id} className="text-[0.68rem] border-l-2 border-[rgba(0,255,65,0.25)] pl-2">
                  <span className="text-dimmer">{fmtDate(t.createdAt)}</span>{" "}
                  <span className="text-dim">{CASE_STATUS_LABELS[t.fromStatus] ?? t.fromStatus}</span>
                  <span className="glow"> → </span>
                  <span className={cn("border px-1", STATUS_STYLES[t.toStatus])}>{CASE_STATUS_LABELS[t.toStatus] ?? t.toStatus}</span>
                  {" "}<span className="text-dimmer">par {t.staff?.username ?? "système"}</span>
                  {t.reason && <p className="text-[#7dffa8]">motif: {t.reason}</p>}
                </div>
              ))}
            </div>

            {/* Notes d'enquête */}
            <h4 className="text-[0.65rem] uppercase tracking-[0.18em] text-dim mb-2">
              Notes d&apos;enquête ({caseData.notes.length})
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto term-scroll mb-3">
              {caseData.notes.length === 0 && <EmptyState text="Aucune note" />}
              {caseData.notes.map((n: CaseNoteRow) => (
                <div key={n.id} className="border-l-2 border-[rgba(0,255,65,0.3)] pl-2 text-[0.72rem]">
                  <p className="text-dimmer">
                    {n.staff?.username ?? "système"} — {fmtDate(n.createdAt)}
                  </p>
                  <p className="text-[#b8f6c9]">{n.body}</p>
                </div>
              ))}
            </div>

            {canNote && (
              <div className="flex gap-2">
                <textarea
                  className="tinput flex-1 px-3 py-2 text-sm min-h-11"
                  placeholder="note d'enquête: recoupements, décision, contact joueur..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  aria-label="Nouvelle note d'enquête"
                />
                <button className="tbtn px-4" onClick={addNote} disabled={busy || !note.trim()}>
                  ajouter
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
