"use client";

/** Détections: filtres (type, sévérité, source), pagination, faux positifs */
import { useCallback, useEffect, useState } from "react";
import { api, useRhode } from "../store";
import { Panel, LoadingLines, EmptyState, SeverityBadge, TypeBadge, fmtDate } from "../terminal-ui";
import type { DetectionRow } from "@/lib/panel-types";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPES = [
  "", "SPEEDHACK", "TELEPORT", "FLY_NOCLIP", "SUPERJUMP", "GODMODE", "INVISIBLE", "COLLISION_OFF",
  "WEAPON_CADENCE", "BLACKLIST_WEAPON", "ONE_HIT_KILL", "VEHICLE_MODEL", "VEHICLE_FLOOD",
  "ECONOMY_ANOMALY", "DUPLICATION", "TELEMETRY_MISMATCH", "EVENT_FLOOD", "EVENT_INVALID",
];
const SEVERITIES = ["", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SOURCES = ["", "CLIENT", "SERVEUR", "CROISEE"];

export function DetectionsView() {
  const { toast } = useToast();
  const { eventTick, permissions } = useRhode();
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ detections: DetectionRow[]; total: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (severity) params.set("severity", severity);
      if (source) params.set("source", source);
      params.set("page", String(page));
      setData(await api(`/api/admin/detections?${params}`));
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Chargement impossible", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [type, severity, source, page, toast]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Auto-refresh sur événement temps réel
  useEffect(() => {
    if (eventTick > 0) load();
  }, [eventTick]);

  const toggleFalse = async (d: DetectionRow) => {
    try {
      await api(`/api/admin/detections/${d.id}/false`, { method: "POST" });
      toast({ title: d.isFalse ? "Marqué comme réel" : "Marqué faux positif", description: `${d.player.name} — ${d.type}` });
      load();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Panel
      title="Journal des détections"
      right={<span className="text-[0.7rem] text-dim">{data ? `${data.total} entrée(s)` : "..."}</span>}
    >
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <select
          className="tinput px-3 text-sm"
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          aria-label="Filtrer par type"
        >
          {TYPES.map((t) => <option key={t} value={t}>{t ? t.replace("_", "/") : "Tous les types"}</option>)}
        </select>
        <select
          className="tinput px-3 text-sm"
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
          aria-label="Filtrer par sévérité"
        >
          {SEVERITIES.map((s) => <option key={s} value={s}>{s || "Toutes sévérités"}</option>)}
        </select>
        <select
          className="tinput px-3 text-sm"
          value={source}
          onChange={(e) => { setSource(e.target.value); setPage(1); }}
          aria-label="Filtrer par source"
        >
          {SOURCES.map((s) => <option key={s} value={s}>{s || "Toutes sources"}</option>)}
        </select>
      </div>

      {loading && !data ? (
        <LoadingLines rows={8} />
      ) : !data || data.detections.length === 0 ? (
        <EmptyState text="Aucune détection pour ces filtres" />
      ) : (
        <div className="overflow-x-auto term-scroll">
          <table className="ttable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Joueur</th>
                <th>Type</th>
                <th>Sévérité</th>
                <th className="hidden md:table-cell">Source</th>
                <th className="hidden md:table-cell">Conf.</th>
                <th className="hidden lg:table-cell">Détails</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.detections.map((d) => {
                let details: Record<string, unknown> = {};
                try { details = JSON.parse(d.details); } catch { /* ignore */ }
                const zone = typeof details.zone === "string" ? details.zone : "";
                return (
                  <tr
                    key={d.id}
                    className={cn(d.isFalse && "opacity-50", "cursor-pointer")}
                    onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                  >
                    <td className="text-dim whitespace-nowrap">{fmtDate(d.createdAt)}</td>
                    <td className="glow-soft">{d.player.name}</td>
                    <td><TypeBadge type={d.type} /></td>
                    <td><SeverityBadge severity={d.severity} /></td>
                    <td className="hidden md:table-cell">
                      <span
                        className={cn(
                          "text-[0.62rem] uppercase tracking-wider",
                          d.source === "SERVEUR" ? "glow" : d.source === "CROISEE" ? "glow-cyan" : "text-dim"
                        )}
                        title={d.detectorVersion ? `détecteur v${d.detectorVersion}` : undefined}
                      >
                        {d.source === "SERVEUR" ? "serveur" : d.source === "CROISEE" ? "croisée" : "client"}
                      </span>
                    </td>
                    <td className="hidden md:table-cell text-dim">{d.confidence}%</td>
                    <td className="hidden lg:table-cell text-dimmer max-w-52 truncate">{zone}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {permissions?.canMarkFalse ? (
                        <button
                          className={cn("tbtn px-2 py-1 h-8 min-h-8 text-[0.65rem]", !d.isFalse && "tbtn-amber")}
                          onClick={() => toggleFalse(d)}
                        >
                          {d.isFalse ? "rétablir" : "faux positif"}
                        </button>
                      ) : d.isFalse ? (
                        <span className="text-dimmer text-[0.65rem]">FAUX POS.</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Détail d'une détection (ligne étendue) */}
      {expanded && data && (() => {
        const d = data.detections.find((x) => x.id === expanded);
        if (!d) return null;
        let details: Record<string, unknown> = {};
        try { details = JSON.parse(d.details); } catch { /* ignore */ }
        return (
          <div className="mt-3 border border-[rgba(0,255,65,0.25)] bg-[#04120a] p-3 text-[0.72rem]">
            <p className="text-dim mb-2">
              <span className="glow-soft">{d.player.name}</span> — {d.type} ({d.severity}, confiance {d.confidence}%)
              {d.detectorVersion && <span className="text-dimmer"> — détecteur v{d.detectorVersion}</span>}
              {d.caseId && <span className="text-dimmer"> — rattaché à un dossier</span>}
            </p>
            <pre className="text-[#7dffa8] whitespace-pre-wrap break-all max-h-40 overflow-y-auto term-scroll">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
        );
      })()}

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
  );
}
