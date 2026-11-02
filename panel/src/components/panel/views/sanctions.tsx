"use client";

/** Sanctions: bans actifs/expirés/révoqués, création, révocation, appels de joueurs */
import { useCallback, useEffect, useState } from "react";
import { api, useRhode } from "../store";
import { Panel, LoadingLines, EmptyState, fmtDate } from "../terminal-ui";
import type { BanRow, PlayerRow, AppealRow } from "@/lib/panel-types";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const FILTERS = [
  { v: "active", l: "Actifs" },
  { v: "", l: "Tous" },
  { v: "expired", l: "Expirés" },
  { v: "revoked", l: "Révoqués" },
];

function banStatus(b: BanRow): { label: string; cls: string } {
  if (b.revokedAt) return { label: "RÉVOQUÉ", cls: "text-dim" };
  if (b.expiresAt && new Date(b.expiresAt) < new Date()) return { label: "EXPIRÉ", cls: "text-dimmer" };
  if (b.type === "PERM") return { label: "PERMANENT", cls: "glow-red" };
  return { label: `→ ${fmtDate(b.expiresAt)}`, cls: "glow-amber" };
}

export function SanctionsView() {
  const { toast } = useToast();
  const { permissions, maxTempBanHours, eventTick } = useRhode();
  const [filter, setFilter] = useState("active");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ bans: BanRow[]; total: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("filter", filter);
      params.set("page", String(page));
      setData(await api(`/api/admin/bans?${params}`));
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Chargement impossible", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filter, page, toast]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    if (eventTick > 0) load();
  }, [eventTick]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const canBan = permissions?.canBanTemp ?? false;

  return (
    <div className="space-y-4">
      <AppealsPanel />

      <Panel
        title="Sanctions"
        right={
          canBan ? (
            <button className="tbtn px-3 h-9 min-h-9 inline-flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> nouveau ban
            </button>
          ) : undefined
        }
      >
        <div className="flex gap-1 mb-4 flex-wrap" role="group" aria-label="Filtre des sanctions">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              onClick={() => { setFilter(f.v); setPage(1); }}
              className={cn("tbtn px-3 h-9 min-h-9", filter === f.v && "bg-[rgba(0,255,65,0.16)] glow")}
            >
              {f.l}
            </button>
          ))}
        </div>

        {loading && !data ? (
          <LoadingLines rows={6} />
        ) : !data || data.bans.length === 0 ? (
          <EmptyState text="Aucune sanction pour ce filtre" />
        ) : (
          <div className="overflow-x-auto term-scroll">
            <table className="ttable">
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th>Statut</th>
                  <th className="hidden md:table-cell">Motif</th>
                  <th className="hidden sm:table-cell">Par</th>
                  <th className="hidden lg:table-cell">HWID</th>
                  <th>Créé</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.bans.map((b) => {
                  const st = banStatus(b);
                  const canRevoke = permissions?.canRevoke && !b.revokedAt;
                  return (
                    <tr key={b.id}>
                      <td className="glow-soft">{b.player.name}</td>
                      <td className={cn("whitespace-nowrap", st.cls)}>{st.label}</td>
                      <td className="hidden md:table-cell text-dim max-w-56 truncate" title={b.reason}>{b.reason}</td>
                      <td className="hidden sm:table-cell text-dim">{b.isAuto ? <span className="glow-amber">AUTO</span> : (b.createdBy?.username ?? "—")}</td>
                      <td className="hidden lg:table-cell">{b.hwidBan ? <span className="glow-red">BL</span> : <span className="text-dimmer">non</span>}</td>
                      <td className="text-dim whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                      <td className="whitespace-nowrap">
                        {b.appealStatus === "PENDING" && <span className="glow-amber text-[0.62rem] mr-2" title="Appel en attente">APPEL</span>}
                        {b.appealStatus === "ACCEPTED" && <span className="glow-cyan text-[0.62rem] mr-2" title="Appel accepté">APPEL OK</span>}
                        {b.appealStatus === "REJECTED" && <span className="text-dimmer text-[0.62rem] mr-2" title="Appel rejeté">APPEL KO</span>}
                        {canRevoke && (
                          <button
                            className="tbtn tbtn-amber px-2 py-1 h-8 min-h-8 text-[0.65rem]"
                            onClick={async () => {
                              const reason = window.prompt(`Motif de la levée du ban de ${b.player.name}:`, "");
                              if (reason === null) return;
                              try {
                                await api(`/api/admin/bans/${b.id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) });
                                toast({ title: "Ban révoqué", description: b.player.name });
                                load();
                              } catch (e) {
                                toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
                              }
                            }}
                          >
                            lever
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-center gap-3 mt-4 text-sm">
            <button className="tbtn px-3 h-9 min-h-9 inline-flex items-center gap-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} /> prec
            </button>
            <span className="text-dim">{page} / {totalPages}</span>
            <button className="tbtn px-3 h-9 min-h-9 inline-flex items-center gap-1" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              suiv <ChevronRight size={14} />
            </button>
          </div>
        )}
      </Panel>

      {showCreate && canBan && (
        <CreateBanDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
          canPerm={permissions?.canBanPerm ?? false}
          canHwid={permissions?.canHwidBan ?? false}
          maxHours={maxTempBanHours}
        />
      )}
    </div>
  );
}

/** Panneau des appels de sanction soumis par les joueurs (formulaire public). */
function AppealsPanel() {
  const { toast } = useToast();
  const { permissions, eventTick } = useRhode();
  const [filter, setFilter] = useState<"pending" | "decided" | "all">("pending");
  const [data, setData] = useState<{ appeals: AppealRow[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<AppealRow | null>(null);

  const canView = permissions?.canViewAppeals ?? false;
  const canDecide = permissions?.canDecideAppeals ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/api/admin/appeals?filter=${filter}`));
    } catch {
      /* silencieux: le panneau est secondaire */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    if (eventTick > 0) load();
  }, [eventTick, load]);

  if (!canView) return null;

  const pendingCount = filter === "pending" && data ? data.total : null;

  return (
    <Panel
      title="Appels de joueurs"
      right={
        pendingCount !== null && pendingCount > 0 ? (
          <span className="glow-amber text-xs">{pendingCount} en attente</span>
        ) : undefined
      }
    >
      <div className="flex gap-1 mb-3 flex-wrap" role="group" aria-label="Filtre des appels">
        {([
          ["pending", "En attente"],
          ["decided", "Statués"],
          ["all", "Tous"],
        ] as const).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={cn("tbtn px-3 h-8 min-h-8 text-xs", filter === v && "bg-[rgba(0,255,65,0.16)] glow")}
          >
            {l}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <LoadingLines rows={3} />
      ) : !data || data.appeals.length === 0 ? (
        <EmptyState text="Aucun appel pour ce filtre" />
      ) : (
        <div className="space-y-2">
          {data.appeals.map((a) => (
            <div key={a.id} className="border border-[rgba(0,255,65,0.18)] p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="glow-soft">{a.playerName || a.ban.player.name}</span>
                    {a.contact && <span className="text-dim text-xs"> · {a.contact}</span>}
                  </p>
                  <p className="text-[0.65rem] text-dimmer truncate">
                    {a.license.slice(0, 26)}… · ban {a.ban.type === "PERM" ? "permanent" : "temporaire"} par{" "}
                    {a.ban.createdBy ?? "auto"} · {fmtDate(a.ban.createdAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[0.65rem] uppercase tracking-widest shrink-0",
                    a.status === "PENDING" && "glow-amber",
                    a.status === "ACCEPTED" && "glow",
                    a.status === "REJECTED" && "glow-red"
                  )}
                >
                  {a.status === "PENDING" ? "EN EXAMEN" : a.status === "ACCEPTED" ? "ACCEPTÉ" : "REJETÉ"}
                </span>
              </div>
              <p className="text-xs text-[#b8f6c9]/80 border-l-2 border-[rgba(0,255,65,0.3)] pl-2">
                « {a.statement.length > 220 ? a.statement.slice(0, 220) + "…" : a.statement} »
              </p>
              {a.decisionNote && (
                <p className="text-[0.68rem] text-dim">
                  décision de {a.handledBy}: {a.decisionNote}
                </p>
              )}
              {a.status === "PENDING" && canDecide && (
                <div className="flex gap-2 pt-1">
                  <button
                    className="tbtn tbtn-amber px-3 h-8 min-h-8 text-xs"
                    onClick={() => setDeciding({ ...a, status: "ACCEPTED" })}
                  >
                    statuer (lever / maintenir)
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deciding && (
        <AppealDecisionDialog
          appeal={data?.appeals.find((x) => x.id === deciding.id) ?? deciding}
          onClose={() => setDeciding(null)}
          onDecided={() => { setDeciding(null); load(); }}
        />
      )}
    </Panel>
  );
}

/** Dialog de décision d'appel: motif obligatoire, accepter = lever la sanction. */
function AppealDecisionDialog({
  appeal, onClose, onDecided,
}: {
  appeal: AppealRow;
  onClose: () => void;
  onDecided: () => void;
}) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<"ACCEPTED" | "REJECTED">("REJECTED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || note.trim().length < 5) return;
    setBusy(true);
    try {
      await api(`/api/admin/appeals/${appeal.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, note: note.trim() }),
      });
      toast({
        title: decision === "ACCEPTED" ? "Appel accepté — sanction levée" : "Appel rejeté — sanction maintenue",
        description: `${appeal.playerName || appeal.ban.player.name}: ${note.trim()}`,
      });
      onDecided();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Décision d'appel"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tpanel p-5 w-full max-w-lg my-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl glow-amber">Statuer sur l&apos;appel</h3>
          <button className="tbtn px-2 h-9 min-h-9" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className="border border-[rgba(0,255,65,0.18)] p-3 space-y-1 text-xs">
          <p>joueur: <span className="glow-soft">{appeal.playerName || appeal.ban.player.name}</span> (risque {appeal.ban.player.riskScore})</p>
          <p>motif du ban: {appeal.ban.reason.slice(0, 160)}</p>
          <p className="text-dim">plaidoirie: « {appeal.statement} »</p>
        </div>

        <div className="flex gap-1" role="group" aria-label="Décision">
          <button
            className={cn("tbtn flex-1", decision === "ACCEPTED" && "bg-[rgba(0,255,65,0.16)] glow")}
            onClick={() => setDecision("ACCEPTED")}
          >
            accepter (lève le ban)
          </button>
          <button
            className={cn("tbtn flex-1", decision === "REJECTED" && "bg-[rgba(255,51,85,0.16)] glow-red")}
            onClick={() => setDecision("REJECTED")}
          >
            rejeter (maintient)
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="apd-note" className="text-sm text-[#7dffa8]">motif de la décision (min. 5 caractères — visible par le joueur):</label>
          <textarea
            id="apd-note"
            className="tinput w-full px-3 py-2 text-sm min-h-20"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={decision === "ACCEPTED" ? "ex: preuves insuffisantes, contexte légitime…" : "ex: détections concordantes, récidive…"}
          />
        </div>

        <button
          className={cn("tbtn w-full font-display text-xl", decision === "REJECTED" && "tbtn-danger")}
          disabled={busy || note.trim().length < 5}
          onClick={submit}
        >
          {busy ? "EXÉCUTION…" : decision === "ACCEPTED" ? "ACCEPTER L'APPEL" : "REJETER L'APPEL"}
        </button>
        <p className="text-[0.65rem] text-dimmer leading-relaxed">
          La décision est définitive pour cette sanction, auditée et notifiée au joueur via le suivi public.
          Accepter l&apos;appel révoque immédiatement la sanction.
        </p>
      </div>
    </div>
  );
}

function CreateBanDialog({
  onClose, onCreated, canPerm, canHwid, maxHours,
}: {
  onClose: () => void;
  onCreated: () => void;
  canPerm: boolean;
  canHwid: boolean;
  maxHours: number;
}) {
  const { toast } = useToast();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [type, setType] = useState<"TEMP" | "PERM">("TEMP");
  const [durationHours, setDurationHours] = useState(24);
  const [hwidBan, setHwidBan] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ players: PlayerRow[] }>("/api/admin/players?pageSize=200&page=1")
      .then((d) => setPlayers(d.players))
      .catch(() => setPlayers([]));
  }, []);

  const submit = async () => {
    if (!playerId || !reason.trim()) return;
    setBusy(true);
    try {
      await api("/api/admin/bans", {
        method: "POST",
        body: JSON.stringify({ playerId, type, durationHours, hwidBan, reason: reason.trim() }),
      });
      toast({ title: "Sanction créée", description: "Le joueur sera bloqué à sa prochaine connexion." });
      onCreated();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="Nouvelle sanction"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tpanel p-5 w-full max-w-lg my-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl glow-red">Nouvelle sanction</h3>
          <button className="tbtn px-2 h-9 min-h-9" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className="space-y-1">
          <label htmlFor="ban-player" className="text-sm text-[#7dffa8]">joueur:</label>
          <select id="ban-player" className="tinput w-full px-3 text-sm" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">— sélectionner —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (risque {p.riskScore})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-[#7dffa8]">type:</label>
            <div className="flex gap-1">
              <button className={cn("tbtn flex-1", type === "TEMP" && "bg-[rgba(0,255,65,0.16)] glow")} onClick={() => setType("TEMP")}>temporaire</button>
              <button
                className={cn("tbtn flex-1", type === "PERM" && "bg-[rgba(255,51,85,0.16)] glow-red")}
                onClick={() => setType("PERM")}
                disabled={!canPerm}
                title={canPerm ? undefined : "Réservé aux ADMIN et OWNER"}
              >
                permanent
              </button>
            </div>
          </div>
          {type === "TEMP" && (
            <div className="space-y-1">
              <label htmlFor="ban-duration" className="text-sm text-[#7dffa8]">durée (h, max {maxHours}):</label>
              <input
                id="ban-duration" type="number" min={1} max={maxHours}
                className="tinput w-full px-3 text-sm" value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-[#7dffa8]">
          <input
            type="checkbox" checked={hwidBan} disabled={!canHwid}
            onChange={(e) => setHwidBan(e.target.checked)} className="accent-[#00ff41]"
          />
          blacklist HWID (multi-comptes) {!canHwid && <span className="text-dimmer">— réservé ADMIN+</span>}
        </label>

        <div className="space-y-1">
          <label htmlFor="ban-reason" className="text-sm text-[#7dffa8]">motif:</label>
          <textarea
            id="ban-reason" className="tinput w-full px-3 py-2 text-sm min-h-20" value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="ex: speedhack récurrent, refuse de coopérer..."
          />
        </div>

        <button
          className="tbtn tbtn-danger w-full font-display text-xl"
          disabled={busy || !playerId || !reason.trim()}
          onClick={submit}
        >
          {busy ? "EXÉCUTION..." : "BANNIR"}
        </button>
      </div>
    </div>
  );
}
