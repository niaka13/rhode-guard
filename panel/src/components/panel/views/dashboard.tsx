"use client";

/** Dashboard v2.2: checklist de démarrage, stats live, mode global, graphique 24h, flux temps réel, top risque */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRhode, api, type ViewId } from "../store";
import { Panel, StatBlock, SeverityBadge, LoadingLines, EmptyState, fmtRelative, RiskBar } from "../terminal-ui";
import type { Stats } from "@/lib/panel-types";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Rocket } from "lucide-react";

const CHECKLIST_KEY = "rg_checklist_done";

const CHECKLIST: { id: string; label: string; detail: string; view: ViewId }[] = [
  {
    id: "install",
    label: "Installer la ressource sur ton serveur",
    detail: "Copie le zip, ajoute ensure rhode_guard dans server.cfg — guide pas-à-pas.",
    view: "install",
  },
  {
    id: "api",
    label: "Brancher la clé API",
    detail: "Colle la clé du panel dans config.lua pour connecter le serveur au panel.",
    view: "install",
  },
  {
    id: "observe",
    label: "Observer 24-48h en mode OBSERVATION",
    detail: "Vérifie les faux positifs dans Détections avant de sanctionner.",
    view: "detections",
  },
  {
    id: "thresholds",
    label: "Ajuster les seuils des détecteurs",
    detail: "Calibre chaque règle (RG-XXX) selon ton gameplay — Réglages.",
    view: "settings",
  },
  {
    id: "staff",
    label: "Inviter ton équipe staff",
    detail: "Crée les comptes avec le bon rôle (modo, admin, auditeur…).",
    view: "staff",
  },
  {
    id: "enforce",
    label: "Passer en AUDIT puis ENFORCE",
    detail: "Dernière étape: active les sanctions automatiques quand tout est calibré.",
    view: "settings",
  },
];

function OnboardingChecklist({ mode }: { mode: string }) {
  const { setView } = useRhode();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Lecture unique au montage — échappe à la règle set-state-in-effect (init localStorage)
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? "{}"));
      setHidden(localStorage.getItem(`${CHECKLIST_KEY}_hide`) === "1");
    } catch { /* stockage indisponible */ }
  }, []);

  const toggle = (id: string) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next)); } catch { /* noop */ }
  };

  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(`${CHECKLIST_KEY}_hide`, "1"); } catch { /* noop */ }
  };

  if (hidden) return null;
  const count = CHECKLIST.filter((c) => done[c.id]).length;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Rocket size={18} className="text-[#00ff41]" aria-hidden="true" />
          Par où commencer
        </span>
      }
      right={
        <span className="flex items-center gap-3">
          <span className={cn("text-[0.7rem]", count === CHECKLIST.length ? "glow" : "text-dim")}>
            {count}/{CHECKLIST.length} fait{count > 1 ? "s" : ""}
          </span>
          <button className="text-[0.65rem] text-dimmer hover:text-[#00ff41] underline underline-offset-2" onClick={hide}>
            masquer
          </button>
        </span>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CHECKLIST.map((c) => {
          const isDone = !!done[c.id];
          return (
            <div
              key={c.id}
              className={cn(
                "flex items-start gap-2.5 border p-2.5 transition-colors",
                isDone
                  ? "border-[rgba(0,255,65,0.15)] opacity-55"
                  : "border-[rgba(0,255,65,0.3)] hover:border-[rgba(0,255,65,0.5)]"
              )}
            >
              <button
                onClick={() => toggle(c.id)}
                aria-label={isDone ? `Marquer « ${c.label} » comme non fait` : `Marquer « ${c.label} » comme fait`}
                className="mt-0.5 shrink-0"
              >
                {isDone
                  ? <CheckCircle2 size={17} className="text-[#00ff41]" aria-hidden="true" />
                  : <Circle size={17} className="text-dim hover:text-[#7dffa8]" aria-hidden="true" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[0.78rem] leading-snug", isDone ? "text-dim line-through" : "text-[#b8f6c9]")}>
                  {c.label}
                </p>
                <p className="text-[0.65rem] text-dimmer mt-0.5">{c.detail}</p>
              </div>
              <button
                className="tbtn px-2 h-7 min-h-7 text-[0.62rem] shrink-0 mt-0.5"
                onClick={() => setView(c.view)}
              >
                aller →
              </button>
            </div>
          );
        })}
      </div>
      {mode === "ENFORCE" && (
        <p className="mt-3 text-[0.65rem] glow-amber">
          ⚠ Mode ENFORCE actif: les sanctions automatiques s&apos;appliquent selon la configuration des Réglages.
        </p>
      )}
    </Panel>
  );
}

export function DashboardView() {
  const { eventTick, events, setMode } = useRhode();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<Stats>("/api/admin/stats");
      setStats(s);
      setMode(s.mode);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [setMode]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const iv = setInterval(load, 20000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [load]);

  // Rafraîchit (debounce) à chaque événement temps réel
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [eventTick, load]);

  if (error) return <EmptyState text={`Erreur de chargement: ${error}`} />;
  if (!stats) return <LoadingLines rows={8} />;

  const chartData = stats.hourly.map((h) => ({
    h: new Date(h.hour).getHours() + "h",
    count: h.count,
  }));

  return (
    <div className="space-y-5">
      {/* Checklist de démarrage */}
      <OnboardingChecklist mode={stats.mode} />

      {/* Bandeau mode */}
      <div
        className={cn(
          "border px-4 py-2 text-[0.72rem] flex flex-wrap items-center gap-2",
          stats.mode === "ENFORCE"
            ? "border-[rgba(255,51,85,0.45)] text-[#ff5577] bg-[rgba(255,51,85,0.05)]"
            : stats.mode === "AUDIT"
              ? "border-[rgba(255,176,0,0.45)] text-[#ffcf66] bg-[rgba(255,176,0,0.05)]"
              : "border-[rgba(53,224,255,0.45)] text-[#7ce8ff] bg-[rgba(53,224,255,0.05)]"
        )}
        role="status"
      >
        <span className="font-display text-base">MODE {stats.mode}</span>
        {stats.mode === "OBSERVATION" && <span className="text-dim">journalisation seule — idéal pour étalonner les seuils (voir Réglages)</span>}
        {stats.mode === "AUDIT" && <span className="text-dim">journalise, ouvre des dossiers et alerte le staff — aucune sanction automatique</span>}
        {stats.mode === "ENFORCE" && <span className="text-dim">sanctions automatiques actives selon la configuration — attention en production</span>}
      </div>

      {/* Bandeau santé des serveurs (§16.1/§22) */}
      {stats.servers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {stats.servers.map((s) => {
            const ageSec = Math.floor((Date.now() - new Date(s.lastHeartbeat).getTime()) / 1000);
            const fresh = ageSec < 180;
            const state = s.healthState ?? (s.isOnline ? "PRET" : "ARRET");
            return (
              <div key={s.id} className="tpanel p-3 text-[0.7rem] flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="glow-soft truncate">{s.name}</span>
                  <span
                    className={cn(
                      "border px-1.5 py-0.5 text-[0.6rem] tracking-widest shrink-0",
                      state === "PRET"
                        ? "border-[rgba(0,255,65,0.5)] text-[#7dffa8]"
                        : state === "DEGRADE"
                          ? "border-[rgba(255,176,0,0.55)] text-[#ffcf66]"
                          : state === "ARRET"
                            ? "border-[rgba(255,51,85,0.6)] text-[#ff5577]"
                            : "border-[rgba(53,224,255,0.4)] text-[#7ce8ff]"
                    )}
                    title="État de santé déclaré par la ressource"
                  >
                    {state}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-dim">
                  <span>v{s.version}</span>
                  <span>{s.onlinePlayers}/{s.maxPlayers} joueurs</span>
                  <span className={fresh ? "text-[#7dffa8]" : "glow-amber"} title="Fraîcheur du dernier heartbeat">
                    {fresh ? "données fraîches" : `heartbeat il y a ${ageSec}s`}
                  </span>
                  <span title="File de preuves locale déclarée">file: {s.queueSize ?? 0}</span>
                  <span title="Détecteurs actifs déclarés">règles: {s.detectorsActive ?? "?"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
        <StatBlock label="Joueurs en ligne" value={stats.onlinePlayers} sub={`${stats.totalPlayers} connus`} accent="green" />
        <StatBlock label="Détections 24h" value={stats.detections24h} sub="fenêtre glissante" accent="amber" />
        <StatBlock label="Dossiers ouverts" value={stats.openCases} sub="en cours de revue" accent="cyan" />
        <StatBlock label="Bans actifs" value={stats.activeBans} sub="temp + permanents" accent="red" />
        <StatBlock label="Serveurs" value={`${stats.servers.filter((s) => s.isOnline).length}/${stats.servers.length}`} sub="en ligne / enregistrés" accent="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4">
        {/* Graphique 24h */}
        <Panel title="Détections — dernières 24h">
          <div className="h-56 sm:h-64 -ml-2" role="img" aria-label="Graphique des détections par heure sur 24 heures">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="greenFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00ff41" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#00ff41" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(0,255,65,0.08)" vertical={false} />
                <XAxis dataKey="h" stroke="#3a6b4c" tick={{ fontSize: 10, fill: "#5c9a72" }} interval="auto" />
                <YAxis stroke="#3a6b4c" tick={{ fontSize: 10, fill: "#5c9a72" }} allowDecimals={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: "#04120a",
                    border: "1px solid rgba(0,255,65,0.4)",
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: 12,
                    color: "#b8f6c9",
                  }}
                  labelStyle={{ color: "#00ff41" }}
                  formatter={(value) => [`${value} détection(s)`, ""]}
                />
                <Area type="monotone" dataKey="count" stroke="#00ff41" strokeWidth={2} fill="url(#greenFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Répartition par type (7j) */}
          <div className="mt-4 space-y-1.5">
            <h3 className="text-[0.65rem] uppercase tracking-[0.18em] text-dim mb-2">Répartition par type (7 jours)</h3>
            {stats.byType.length === 0 && <p className="text-dim text-xs">Aucune détection sur la période.</p>}
            {stats.byType.slice(0, 6).map((t) => {
              const max = stats.byType[0]?.count ?? 1;
              return (
                <div key={t.type} className="flex items-center gap-2 text-[0.7rem]">
                  <span className="w-24 shrink-0 text-[#7ce8ff]">{t.type.replace("_", "/")}</span>
                  <div className="flex-1 h-3 bg-black/50 border border-[rgba(0,255,65,0.15)]">
                    <div className="h-full bg-[rgba(0,255,65,0.5)]" style={{ width: `${(t.count / max) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-dim">{t.count}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Feed temps réel */}
        <Panel
          title="Flux temps réel"
          right={<span className="text-[0.65rem] glow-soft animate-pulse">● LIVE</span>}
        >
          <div className="space-y-1.5 max-h-72 overflow-y-auto term-scroll pr-1" aria-live="polite">
            {events.length === 0 && (
              <p className="text-dim text-xs py-4 text-center">En écoute du relay... les événements apparaîtront ici.</p>
            )}
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-[0.72rem] border-b border-[rgba(0,255,65,0.08)] pb-1.5">
                <span className="text-dimmer shrink-0">{new Date(e.at).toLocaleTimeString("fr-FR")}</span>
                {e.kind === "detection" ? (
                  <>
                    <SeverityBadge severity={e.severity ?? "LOW"} />
                    <span>
                      <span className="glow-soft">{e.playerName}</span> — {e.type?.replace("_", "/")}
                    </span>
                  </>
                ) : e.kind === "case" ? (
                  <span className="glow-cyan">DOSSIER {e.ref} → {e.playerName} ({e.type})</span>
                ) : e.kind === "ban" ? (
                  <span className="glow-red">BAN {e.isAuto ? "(auto) " : ""}→ {e.playerName}</span>
                ) : (
                  <span className="glow-cyan">UNBAN → {e.playerName}</span>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Top risque */}
        <Panel title="Joueurs à plus haut risque">
          {stats.topRisk.length === 0 ? (
            <EmptyState text="Aucun joueur à risque actuellement" />
          ) : (
            <ul className="space-y-2">
              {stats.topRisk.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={p.isOnline ? "text-[#00ff41]" : "text-dimmer"}>●</span>
                    <span className="glow-soft truncate">{p.name}</span>
                  </span>
                  <RiskBar score={p.riskScore} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Dernières détections */}
        <Panel title="Dernières détections">
          {stats.recent.length === 0 ? (
            <EmptyState text="Aucune détection enregistrée" />
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto term-scroll pr-1">
              {stats.recent.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-[0.72rem]">
                  <span className="text-dimmer shrink-0">{fmtRelative(d.createdAt)}</span>
                  <SeverityBadge severity={d.severity} />
                  <span className="glow-soft truncate">{d.player.name}</span>
                  <span className="text-[#7ce8ff] ml-auto shrink-0">{d.type.replace("_", "/")}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
