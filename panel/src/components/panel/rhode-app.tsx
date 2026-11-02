"use client";

/** Shell principal RHODE GUARD: navigation, statut, activité authentifiée et aide */
import { useEffect, useMemo, useState } from "react";
import { useRhode, disconnectRealtime, connectRealtime, api, type ViewId } from "./store";
import {
  LayoutDashboard, Users, Radar, Gavel, UserCog, ScrollText, Webhook, Server, Download, LogOut, ShieldCheck, FolderOpen, Settings2,
  Search, Zap, CircleHelp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveDot } from "./terminal-ui";
import { ROLE_LABELS } from "@/lib/panel-types";
import type { StaffPermissions } from "@/lib/panel-types";
import { DashboardView } from "./views/dashboard";
import { PlayersView } from "./views/players";
import { DetectionsView } from "./views/detections";
import { CasesView } from "./views/cases";
import { SanctionsView } from "./views/sanctions";
import { SettingsView } from "./views/settings";
import { StaffView } from "./views/staff";
import { AuditView } from "./views/audit";
import { WebhooksView } from "./views/webhooks";
import { ServersView } from "./views/servers";
import { InstallView } from "./views/install";
import { CommandPalette } from "./command-palette";
import { QuickSanction } from "./quick-sanction";

const NAV: { id: ViewId; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }>; perm?: keyof StaffPermissions }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "players", label: "Joueurs", icon: Users },
  { id: "detections", label: "Détections", icon: Radar },
  { id: "cases", label: "Dossiers", icon: FolderOpen },
  { id: "sanctions", label: "Sanctions", icon: Gavel },
  { id: "settings", label: "Réglages", icon: Settings2, perm: "canViewSettings" },
  { id: "staff", label: "Staff", icon: UserCog, perm: "canManageStaff" },
  { id: "audit", label: "Audit", icon: ScrollText, perm: "canViewAudit" },
  { id: "webhooks", label: "Webhooks", icon: Webhook, perm: "canManageWebhooks" },
  { id: "servers", label: "Serveurs", icon: Server, perm: "canManageServers" },
  { id: "install", label: "Installation", icon: Download },
];

/** Aide d'une ligne par vue — affichée sous le header quand on change de page. */
const VIEW_HINTS: Partial<Record<ViewId, string>> = {
  dashboard: "Vue d'ensemble en temps réel: santé serveurs, détections 24h, joueurs à risque.",
  players: "Toutes les fiches joueurs: risque, détections, historique de bans. Clique « fiche » pour tout voir.",
  detections: "Journal brut de toutes les détections envoyées par la ressource anti-cheat.",
  cases: "Enquêtes groupées: regroupe les détections d'un joueur et décide avec preuves.",
  sanctions: "Tous les bans actifs et révoqués, avec motifs et responsables.",
  settings: "Seuils des détecteurs, mode global (OBSERVATION → AUDIT → ENFORCE), rétention.",
  staff: "Comptes staff, rôles et permissions (5 niveaux hiérarchiques).",
  audit: "Journal complet et infalsifiable de toutes les actions staff.",
  webhooks: "Notifications Discord automatiques (ban, détection critique, appel…).",
  servers: "Serveurs FiveM enregistrés, clés API, heartbeats.",
  install: "Guide pas-à-pas pour installer la ressource sur ton serveur FiveM.",
};

const MODE_STYLES: Record<string, string> = {
  OBSERVATION: "border-[rgba(53,224,255,0.5)] text-[#7ce8ff]",
  AUDIT: "border-[rgba(255,176,0,0.55)] text-[#ffcf66]",
  ENFORCE: "border-[rgba(255,51,85,0.6)] text-[#ff5577]",
};

export function RhodeApp() {
  const {
    staff, permissions, view, setView, wsConnected, eventsPerMin, eventTick,
    clearSession, mode, toast, toasts, dismissToast, setPaletteOpen,
    setQuickBanOpen, helpOpen, setHelpOpen,
  } = useRhode();
  const [clock, setClock] = useState("");
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    // Actualisation same-origin via cookie de session HttpOnly.
    connectRealtime();
    return () => disconnectRealtime();
  }, []);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("fr-FR"));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const visibleNav = useMemo(
    () => NAV.filter((n) => !n.perm || permissions?.[n.perm]),
    [permissions]
  );

  // Si la vue courante n'est plus autorisée (changement de rôle), retour dashboard
  useEffect(() => {
    const current = visibleNav.find((n) => n.id === view);
    if (!current && view !== "dashboard") setView("dashboard");
  }, [visibleNav, view, setView]);

  // Ré-affiche l'aide de vue à chaque changement de page (pattern reset pendant le render)
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    setHintVisible(true);
  }
  useEffect(() => {
    const t = setTimeout(() => setHintVisible(false), 9000);
    return () => clearTimeout(t);
  }, [view]);

  // Raccourcis clavier globaux
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      // Ctrl+K / Cmd+K: palette (partout, même en train de taper)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (typing) return;
      // Alt+1..9: navigation directe
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const item = visibleNav[Number(e.key) - 1];
        if (item) {
          e.preventDefault();
          setView(item.id);
        }
        return;
      }
      // Alt+B: sanction rapide
      if (e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setQuickBanOpen(true);
        return;
      }
      // "?": aide
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleNav, setView, setPaletteOpen, setQuickBanOpen, setHelpOpen]);

  const logout = async () => {
    try { await api("/api/admin/logout", { method: "POST" }); } catch { /* déjà déconnecté */ }
    clearSession();
    disconnectRealtime();
    window.location.reload();
  };

  const canBan = permissions?.canBanTemp || permissions?.canBanPerm;

  return (
    <div className="min-h-screen flex flex-col bg-[#020803] crt-flicker">
      {/* ===== Header ===== */}
      <header className="border-b border-[rgba(0,255,65,0.25)] bg-[#04120a] sticky top-0 z-40">
        <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck className="text-[#00ff41] shrink-0" size={22} aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl glow leading-none truncate">RHODE GUARD</h1>
              <p className="text-[0.6rem] text-dimmer uppercase tracking-[0.2em] hidden sm:block">anti-cheat fivem — ultimate v2.2</p>
            </div>
            <span
              className={cn("hidden sm:inline-block border px-1.5 py-0.5 text-[0.6rem] tracking-widest ml-1", MODE_STYLES[mode])}
              title="Mode global appliqué par le panel et la ressource"
            >
              MODE {mode}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Recherche globale */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="tbtn px-2.5 h-9 min-h-9 inline-flex items-center gap-1.5"
              aria-label="Recherche globale (Ctrl+K)"
              title="Tout rechercher — Ctrl+K"
            >
              <Search size={14} aria-hidden="true" />
              <span className="hidden md:inline text-[0.7rem] text-dimmer">Ctrl+K</span>
            </button>
            {/* Sanction rapide */}
            {canBan && (
              <button
                onClick={() => setQuickBanOpen(true)}
                className="tbtn tbtn-danger px-2.5 h-9 min-h-9 inline-flex items-center gap-1.5"
                aria-label="Sanction rapide (Alt+B)"
                title="Sanction rapide — Alt+B"
              >
                <Gavel size={14} aria-hidden="true" />
                <span className="hidden lg:inline">Sanction rapide</span>
              </button>
            )}
            {/* Aide */}
            <button
              onClick={() => setHelpOpen(true)}
              className="tbtn px-2.5 h-9 min-h-9 inline-flex items-center gap-1.5"
              aria-label="Aide et raccourcis (?)"
              title="Aide & raccourcis — ?"
            >
              <CircleHelp size={14} aria-hidden="true" />
            </button>
            <LiveDot on={wsConnected} label={wsConnected ? "SYNCHRONISÉ" : "HORS LIGNE"} />
            <span className="hidden md:inline text-[0.7rem] text-dim">
              {eventsPerMin} evt/min <span className="text-dimmer">(tick #{eventTick})</span>
            </span>
            <button
              onClick={logout}
              className="tbtn px-2.5 h-9 min-h-9 inline-flex items-center gap-1.5"
              aria-label="Déconnexion"
            >
              <LogOut size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Quitter</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row min-w-0">
        {/* ===== Nav latérale (desktop) / horizontale sticky (mobile) ===== */}
        <nav
          aria-label="Navigation principale"
          className="lg:w-52 shrink-0 border-b lg:border-b-0 lg:border-r border-[rgba(0,255,65,0.18)] bg-[#031007] overflow-x-auto lg:overflow-visible term-scroll sticky lg:static top-[57px] lg:top-auto z-30"
        >
          <ul className="flex lg:flex-col gap-1 p-2 min-w-max lg:min-w-0">
            {visibleNav.map((item, idx) => {
              const active = view === item.id;
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setView(item.id)}
                    aria-current={active ? "page" : undefined}
                    title={`${item.label} — Alt+${idx + 1 < 10 ? idx + 1 : "·"}`}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 min-h-11 text-left text-[0.78rem] uppercase tracking-wider transition-all border",
                      active
                        ? "border-[rgba(0,255,65,0.5)] bg-[rgba(0,255,65,0.1)] glow"
                        : "border-transparent text-dim hover:text-[#7dffa8] hover:bg-[rgba(0,255,65,0.05)]"
                    )}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {item.label}
                    <span className="ml-auto hidden lg:inline text-[0.55rem] text-dimmer" aria-hidden="true">
                      {idx < 9 ? `⌥${idx + 1}` : ""}
                    </span>
                    {active && <span className="lg:hidden text-[#00ff41] ml-1" aria-hidden="true">▸</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ===== Contenu ===== */}
        <main className="flex-1 p-3 sm:p-5 min-w-0 term-scroll">
          {/* Aide contextuelle de la vue */}
          {hintVisible && VIEW_HINTS[view] && (
            <div
              className="mb-4 border border-[rgba(53,224,255,0.3)] bg-[rgba(53,224,255,0.04)] px-3 py-2 text-[0.72rem] text-[#7ce8ff] flex items-start gap-2"
              role="note"
            >
              <Zap size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{VIEW_HINTS[view]}</span>
              <button onClick={() => setHintVisible(false)} className="text-dimmer hover:text-[#00ff41] shrink-0" aria-label="Masquer l'aide">✕</button>
            </div>
          )}
          {view === "dashboard" && <DashboardView />}
          {view === "players" && <PlayersView />}
          {view === "detections" && <DetectionsView />}
          {view === "cases" && <CasesView />}
          {view === "sanctions" && <SanctionsView />}
          {view === "settings" && <SettingsView />}
          {view === "staff" && <StaffView />}
          {view === "audit" && <AuditView />}
          {view === "webhooks" && <WebhooksView />}
          {view === "servers" && <ServersView />}
          {view === "install" && <InstallView />}
        </main>
      </div>

      {/* ===== Barre de statut (tmux-like) ===== */}
      <footer className="mt-auto border-t border-[rgba(0,255,65,0.25)] bg-[#0a2413]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[0.68rem] uppercase tracking-wider">
          <span className="bg-[#00ff41] text-[#02180a] px-2 py-0.5 font-bold">rhode-guard</span>
          <span className="text-[#7dffa8]">{staff?.username}</span>
          <span className="text-dim">[{ROLE_LABELS[staff?.role ?? ""] ?? staff?.role}]</span>
          <span className={cn("border px-1.5", MODE_STYLES[mode])}>MODE {mode}</span>
          <span className={wsConnected ? "glow" : "glow-red"}>{wsConnected ? "● ACTUALISATION ACTIVE" : "○ ACTUALISATION EN PAUSE"}</span>
          <span className="text-dim hidden sm:inline">{eventsPerMin} evt/min</span>
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:inline text-dimmer hover:text-[#00ff41] transition-colors"
            title="Ouvrir la recherche globale"
          >
            [ctrl+k rechercher]
          </button>
          <span className="ml-auto text-dim" aria-label="Horloge">{clock}</span>
        </div>
      </footer>

      {/* ===== Overlays globaux ===== */}
      <CommandPalette />
      <QuickSanction />
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      {/* ===== Toasts ===== */}
      <div className="fixed bottom-14 right-3 z-[95] flex flex-col gap-2 w-72 max-w-[calc(100vw-1.5rem)]" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismissToast(t.id)}
            className={cn(
              "text-left border px-3 py-2 text-[0.75rem] backdrop-blur-sm shadow-lg transition-all animate-[toastIn_.18s_ease-out]",
              t.kind === "ok" && "border-[rgba(0,255,65,0.55)] bg-[rgba(2,24,10,0.95)] text-[#7dffa8]",
              t.kind === "err" && "border-[rgba(255,51,85,0.6)] bg-[rgba(26,2,8,0.95)] text-[#ff5577]",
              t.kind === "info" && "border-[rgba(53,224,255,0.5)] bg-[rgba(2,16,22,0.95)] text-[#7ce8ff]"
            )}
          >
            <span className="font-bold mr-1">
              {t.kind === "ok" ? "[OK]" : t.kind === "err" ? "[ERREUR]" : "[INFO]"}
            </span>
            {t.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Modal d'aide & raccourcis. */
function HelpDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["Ctrl + K", "Recherche globale: joueurs, pages, actions (palette)"],
    ["Alt + B", "Sanction rapide (bannir en 3 clics)"],
    ["Alt + 1…9", "Aller directement à une page de la navigation"],
    ["?", "Ouvrir cette aide"],
    ["ESC", "Fermer une fenêtre / modal"],
  ];
  const tips = [
    "La barre « MODE » (en haut) indique si l'anti-cheat observe seulement (OBSERVATION), enquête (AUDIT) ou sanctionne automatiquement (ENFORCE).",
    "Commence toujours par la vue Installation pour brancher ton serveur FiveM en 5 minutes.",
    "Chaque fiche joueur centralise risque, détections, dossiers et bans — tout est traçable.",
    "Le journal d'audit est infalsifiable: chaque action staff est enregistrée avec auteur et horodatage.",
  ];
  return (
    <div
      className="fixed inset-0 z-[88] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Aide et raccourcis"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tpanel p-5 w-full max-w-lg my-4 space-y-5" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl glow">Aide express</h2>
          <button className="tbtn px-2 h-9 min-h-9" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-[0.65rem] uppercase tracking-[0.18em] text-dim">Raccourcis clavier</h3>
          {rows.map(([k, d]) => (
            <div key={k} className="flex items-center gap-3 text-[0.75rem]">
              <kbd className="border border-[rgba(0,255,65,0.35)] px-2 py-0.5 text-[#7dffa8] min-w-16 text-center shrink-0">{k}</kbd>
              <span className="text-dim">{d}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h3 className="text-[0.65rem] uppercase tracking-[0.18em] text-dim">Bon à savoir</h3>
          {tips.map((t, i) => (
            <p key={i} className="text-[0.72rem] text-dim leading-relaxed">
              <span className="text-[#00ff41]">▸</span> {t}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
