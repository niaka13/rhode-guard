"use client";

/** Audit: journal des actions staff */
import { useCallback, useEffect, useState } from "react";
import { api } from "../store";
import { Panel, LoadingLines, EmptyState, fmtDate } from "../terminal-ui";
import type { AuditRow } from "@/lib/panel-types";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Connexion",
  BAN_CREATE: "Ban créé",
  BAN_REVOKE: "Ban levé",
  FALSE_POSITIVE_MARK: "Faux positif marqué",
  FALSE_POSITIVE_UNMARK: "Faux positif rétabli",
  STAFF_CREATE: "Compte staff créé",
  STAFF_UPDATE: "Compte staff modifié",
  STAFF_DELETE: "Compte staff supprimé",
  WEBHOOK_CREATE: "Webhook créé",
  WEBHOOK_UPDATE: "Webhook modifié",
  WEBHOOK_DELETE: "Webhook supprimé",
  WEBHOOK_TEST: "Webhook testé",
  KEY_REGENERATE: "Clé API régénérée",
  SERVER_CREATE: "Serveur ajouté",
  SERVER_DELETE: "Serveur supprimé",
};

export function AuditView() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ logs: AuditRow[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/admin/audit?page=${page}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [page]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Panel title="Journal d'audit" right={<span className="text-[0.7rem] text-dim">{data ? `${data.total} action(s)` : "..."}</span>}>
      {error && <EmptyState text={error} />}
      {!data && !error && <LoadingLines rows={6} />}
      {data && data.logs.length === 0 && <EmptyState text="Aucune action enregistrée" />}
      {data && data.logs.length > 0 && (
        <>
          <div className="overflow-x-auto term-scroll">
            <table className="ttable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Staff</th>
                  <th>Action</th>
                  <th className="hidden sm:table-cell">Cible</th>
                  <th className="hidden lg:table-cell">Détails</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l) => {
                  let details = "";
                  try {
                    const d = JSON.parse(l.details) as Record<string, unknown>;
                    details = Object.entries(d).map(([k, v]) => `${k}=${String(v)}`).join(" · ").slice(0, 90);
                  } catch { /* ignore */ }
                  return (
                    <tr key={l.id}>
                      <td className="text-dim whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                      <td className="glow-soft">{l.staff?.username ?? "système"}</td>
                      <td className="text-[#7ce8ff]">{ACTION_LABELS[l.action] ?? l.action}</td>
                      <td className="hidden sm:table-cell text-dim max-w-44 truncate">{l.target ?? "—"}</td>
                      <td className="hidden lg:table-cell text-dimmer max-w-64 truncate">{details}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.total > data.pageSize && (
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
        </>
      )}
    </Panel>
  );
}
