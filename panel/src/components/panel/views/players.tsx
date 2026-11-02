"use client";

/** Joueurs: recherche, liste, fiche détaillée */
import { useCallback, useEffect, useState } from "react";
import { api, useRhode } from "../store";
import { Panel, LoadingLines, EmptyState, RiskBar, fmtDate, fmtRelative, fmtDurationMin, SeverityBadge, TypeBadge, CopyButton } from "../terminal-ui";
import type { PlayerRow, DetectionRow, BanRow, CaseRow } from "@/lib/panel-types";
import { CASE_STATUS_LABELS } from "@/lib/panel-types";
import { useToast } from "@/hooks/use-toast";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

type PlayerDetail = PlayerRow & {
  identifiers: Record<string, string | null>;
  hwids: string[];
  detections: DetectionRow[];
  bans: BanRow[];
  cases: (CaseRow & { _count: { detections: number } })[];
};

export function PlayersView() {
  const { toast } = useToast();
  const { focusPlayerId, setFocusPlayerId } = useRhode();
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState<"" | "0" | "1">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ players: PlayerRow[]; total: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (online) params.set("online", online);
      params.set("page", String(page));
      setData(await api(`/api/admin/players?${params}`));
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Chargement impossible", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, online, page, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce recherche
    return () => clearTimeout(t);
  }, [load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      setDetail(await api<PlayerDetail>(`/api/admin/players/${id}`));
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Fiche indisponible", variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // Ouverture directe d'une fiche ciblée (depuis la palette Ctrl+K)
  useEffect(() => {
    if (focusPlayerId) {
      void openDetail(focusPlayerId);
      setFocusPlayerId(null);
    }
  }, [focusPlayerId, openDetail, setFocusPlayerId]);

  return (
    <div className="space-y-4">
      <Panel
        title="Joueurs surveillés"
        right={<span className="text-[0.7rem] text-dim">{data ? `${data.total} joueur(s)` : "..."}</span>}
      >
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden="true" />
            <input
              className="tinput w-full pl-9 pr-3 text-sm"
              placeholder="recherche: pseudo ou license:..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              aria-label="Rechercher un joueur"
            />
          </div>
          <div className="flex gap-1" role="group" aria-label="Filtre de connexion">
            {[
              { v: "", l: "Tous" },
              { v: "1", l: "En ligne" },
              { v: "0", l: "Hors ligne" },
            ].map((f) => (
              <button
                key={f.v}
                onClick={() => { setOnline(f.v as "" | "0" | "1"); setPage(1); }}
                className={cn("tbtn px-3 h-11 flex-1 sm:flex-none", online === f.v && "bg-[rgba(0,255,65,0.16)] glow")}
              >
                {f.l}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <LoadingLines rows={6} />
        ) : !data || data.players.length === 0 ? (
          <EmptyState text="Aucun joueur trouvé" />
        ) : (
          <div className="overflow-x-auto term-scroll">
            <table className="ttable">
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th>Risque</th>
                  <th>Détections</th>
                  <th>Bans</th>
                  <th className="hidden md:table-cell">Temps de jeu</th>
                  <th className="hidden sm:table-cell">Vu</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className={p.isOnline ? "text-[#00ff41] mr-1.5" : "text-dimmer mr-1.5"}>●</span>
                      <span className="glow-soft">{p.name}</span>
                    </td>
                    <td><RiskBar score={p.riskScore} /></td>
                    <td className="text-[#ffcf66]">{p.detectionCount}</td>
                    <td className="text-[#ff5577]">{p.banCount}</td>
                    <td className="hidden md:table-cell text-dim">{fmtDurationMin(p.playTimeMin)}</td>
                    <td className="hidden sm:table-cell text-dim">{fmtRelative(p.lastSeen)}</td>
                    <td>
                      <button className="tbtn px-2 py-1 h-8 min-h-8" onClick={() => openDetail(p.id)}>fiche</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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

      {/* Fiche détaillée (dialog) */}
      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Fiche joueur"
          onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}
        >
          <div className="tpanel p-5 w-full max-w-2xl my-4" onKeyDown={(e) => { if (e.key === "Escape") setDetail(null); }}>
            {detailLoading || !detail ? (
              <LoadingLines rows={6} />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h3 className="font-display text-2xl glow">{detail.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[0.68rem] text-dimmer break-all">{detail.license}</p>
                      <CopyButton value={detail.license} label="la licence" />
                    </div>
                  </div>
                  <button className="tbtn px-2 h-9 min-h-9" onClick={() => setDetail(null)} aria-label="Fermer">
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.7rem] mb-4">
                  <div className="border border-[rgba(0,255,65,0.2)] p-2">
                    <p className="text-dimmer uppercase text-[0.6rem]">Risque</p>
                    <p className="glow text-lg">{detail.riskScore}</p>
                  </div>
                  <div className="border border-[rgba(0,255,65,0.2)] p-2">
                    <p className="text-dimmer uppercase text-[0.6rem]">Statut</p>
                    <p className={detail.isOnline ? "glow" : "text-dim"}>{detail.isOnline ? "EN LIGNE" : "HORS LIGNE"}</p>
                  </div>
                  <div className="border border-[rgba(0,255,65,0.2)] p-2">
                    <p className="text-dimmer uppercase text-[0.6rem]">Jeu</p>
                    <p className="text-dim">{fmtDurationMin(detail.playTimeMin)}</p>
                  </div>
                  <div className="border border-[rgba(0,255,65,0.2)] p-2">
                    <p className="text-dimmer uppercase text-[0.6rem]">Vu</p>
                    <p className="text-dim">{fmtRelative(detail.lastSeen)}</p>
                  </div>
                </div>

                {/* Identifiants */}
                <details className="mb-4 border border-[rgba(0,255,65,0.15)] p-2 text-[0.7rem]">
                  <summary className="text-dim cursor-pointer select-none">Identifiants & HWID ({detail.hwids.length})</summary>
                  <ul className="mt-2 space-y-0.5">
                    {Object.entries(detail.identifiers).filter(([, v]) => v).map(([k, v]) => (
                      <li key={k}><span className="text-dimmer">{k}:</span> <span className="text-[#7dffa8] break-all">{v}</span></li>
                    ))}
                    {detail.hwids.map((h, i) => (
                      <li key={h}><span className="text-dimmer">hwid[{i}]:</span> <span className="text-[#7ce8ff] break-all">{h}</span></li>
                    ))}
                  </ul>
                </details>

                {/* Dossiers */}
                <h4 className="text-[0.65rem] uppercase tracking-[0.18em] text-dim mb-2">Dossiers ({detail.cases?.length ?? 0})</h4>
                <div className="space-y-1.5 max-h-32 overflow-y-auto term-scroll mb-4">
                  {(!detail.cases || detail.cases.length === 0) && <EmptyState text="Aucun dossier" />}
                  {detail.cases?.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 text-[0.7rem] border-b border-[rgba(0,255,65,0.08)] pb-1">
                      <span className="glow-cyan">{c.ref}</span>
                      <span className={cn(
                        "text-[0.6rem]",
                        c.status === "OPEN" ? "text-[#7dffa8]" : c.status === "REVIEWING" ? "text-[#ffcf66]" : "text-dim"
                      )}>
                        {CASE_STATUS_LABELS[c.status] ?? c.status}
                      </span>
                      <span className="text-dimmer">{c._count.detections} détection(s)</span>
                      <span className="text-dim ml-auto">{c.summary}</span>
                    </div>
                  ))}
                </div>

                {/* Détections */}
                <h4 className="text-[0.65rem] uppercase tracking-[0.18em] text-dim mb-2">Dernières détections ({detail.detections.length})</h4>
                <div className="space-y-1.5 max-h-56 overflow-y-auto term-scroll mb-4">
                  {detail.detections.length === 0 && <EmptyState text="Aucune détection" />}
                  {detail.detections.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-2 text-[0.7rem] border-b border-[rgba(0,255,65,0.08)] pb-1">
                      <span className="text-dimmer">{fmtDate(d.createdAt)}</span>
                      <SeverityBadge severity={d.severity} />
                      <TypeBadge type={d.type} />
                      {d.isFalse && <span className="text-dimmer line-through">FAUX POSITIF</span>}
                    </div>
                  ))}
                </div>

                {/* Bans */}
                <h4 className="text-[0.65rem] uppercase tracking-[0.18em] text-dim mb-2">Historique de bans ({detail.bans.length})</h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto term-scroll">
                  {detail.bans.length === 0 && <EmptyState text="Aucun ban" />}
                  {detail.bans.map((b) => (
                    <div key={b.id} className="text-[0.7rem] border-b border-[rgba(0,255,65,0.08)] pb-1">
                      <span className={b.revokedAt ? "text-dim" : b.type === "PERM" ? "glow-red" : "glow-amber"}>
                        {b.type === "PERM" ? "PERMANENT" : "TEMPORAIRE"}
                      </span>
                      {b.isAuto && <span className="text-dimmer"> (auto)</span>}
                      <span className="text-dimmer"> — {fmtDate(b.createdAt)}</span>
                      <p className="text-[#7dffa8]">{b.reason}</p>
                      {b.revokedAt && <p className="text-dimmer">révoqué par {b.revokedBy?.username ?? "?"}: {b.revokeReason}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
