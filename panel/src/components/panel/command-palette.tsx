"use client";

/**
 * Palette de commandes globale (Ctrl+K) — tout en 1:
 * navigation, recherche de joueurs, actions rapides.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRhode, api, type ViewId } from "./store";
import type { PlayerRow, StaffPermissions } from "@/lib/panel-types";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Radar, FolderOpen, Gavel, Settings2, UserCog,
  ScrollText, Webhook, Server, Download, Zap, Gavel as GavelIcon, CircleHelp,
} from "lucide-react";

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  group: "Navigation" | "Joueurs" | "Actions";
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  run: () => void;
};

const VIEW_ICONS: Record<ViewId, React.ComponentType<{ size?: number | string; className?: string }>> = {
  dashboard: LayoutDashboard,
  players: Users,
  detections: Radar,
  cases: FolderOpen,
  sanctions: Gavel,
  settings: Settings2,
  staff: UserCog,
  audit: ScrollText,
  webhooks: Webhook,
  servers: Server,
  install: Download,
};

export function CommandPalette() {
  const {
    paletteOpen, setPaletteOpen, setView, setQuickBanOpen, setHelpOpen,
    setFocusPlayerId, permissions, mode,
  } = useRhode();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset à l'ouverture
  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setSel(0);
      setPlayers([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  // Recherche de joueurs (debounce, seulement si >= 2 caractères)
  useEffect(() => {
    if (!paletteOpen) return;
    const term = q.trim();
    if (term.length < 2) {
      setPlayers([]);
      return;
    }
    const t = setTimeout(async () => {
      setPlayersLoading(true);
      try {
        const res = await api<{ players: PlayerRow[] }>(
          `/api/admin/players?search=${encodeURIComponent(term)}&pageSize=5`
        );
        setPlayers(res.players ?? []);
      } catch {
        setPlayers([]);
      } finally {
        setPlayersLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, paletteOpen]);

  const close = () => setPaletteOpen(false);

  const navCmds: { id: ViewId; label: string }[] = useMemo(
    () => [
      { id: "dashboard", label: "Dashboard" },
      { id: "players", label: "Joueurs" },
      { id: "detections", label: "Détections" },
      { id: "cases", label: "Dossiers" },
      { id: "sanctions", label: "Sanctions" },
      { id: "install", label: "Installation (guide)" },
      { id: "settings", label: "Réglages" },
      { id: "staff", label: "Staff" },
      { id: "audit", label: "Audit" },
      { id: "webhooks", label: "Webhooks" },
      { id: "servers", label: "Serveurs" },
    ],
    []
  );

  const cmds: Cmd[] = useMemo(() => {
    const out: Cmd[] = [];
    // Actions rapides d'abord
    if (permissions?.canBanTemp || permissions?.canBanPerm) {
      out.push({
        id: "act-ban",
        label: "Sanction rapide…",
        hint: "bannir un joueur en 3 clics",
        group: "Actions",
        icon: GavelIcon,
        run: () => setQuickBanOpen(true),
      });
    }
    out.push({
      id: "act-help",
      label: "Aide & raccourcis clavier",
      hint: "guide express du panel",
      group: "Actions",
      icon: CircleHelp,
      run: () => setHelpOpen(true),
    });
    if (permissions?.canViewSettings) {
      out.push({
        id: "act-mode",
        label: `Passer le mode en ${mode === "ENFORCE" ? "AUDIT" : "ENFORCE"}`,
        hint: mode === "ENFORCE"
          ? "ENFORCE → AUDIT (désactive les sanctions auto)"
          : `${mode} → ENFORCE (active les sanctions auto — Réglages)`,
        group: "Actions",
        icon: Zap,
        run: () => setView("settings"),
      });
    }
    // Navigation
    for (const v of navCmds) {
      out.push({
        id: `nav-${v.id}`,
        label: `Aller à: ${v.label}`,
        group: "Navigation",
        icon: VIEW_ICONS[v.id],
        run: () => setView(v.id),
      });
    }
    // Joueurs trouvés
    for (const p of players) {
      out.push({
        id: `player-${p.id}`,
        label: p.name,
        hint: `risque ${p.riskScore} — ${p.detectionCount} détection(s), ${p.banCount} ban(s)`,
        group: "Joueurs",
        icon: Users,
        run: () => {
          setFocusPlayerId(p.id);
          setView("players");
        },
      });
    }
    return out;
  }, [permissions, players, navCmds, setView, setQuickBanOpen, setHelpOpen, mode, setFocusPlayerId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return cmds;
    return cmds.filter(
      (c) =>
        c.label.toLowerCase().includes(term) ||
        (c.hint ?? "").toLowerCase().includes(term)
    );
  }, [cmds, q]);

  // Réinitialise la sélection quand la requête change (pattern React: reset pendant le render)
  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) {
    setPrevQ(q);
    setSel(0);
  }

  // Scroll de l'élément sélectionné dans la vue
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!paletteOpen) return null;

  const runIdx = (i: number) => {
    const c = filtered[i];
    if (!c) return;
    close();
    c.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runIdx(sel);
    }
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/75 flex items-start justify-center pt-[10vh] px-3"
      role="dialog"
      aria-modal="true"
      aria-label="Palette de commandes"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="tpanel w-full max-w-xl overflow-hidden" onKeyDown={onKey}>
        {/* Champ de recherche */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(0,255,65,0.25)]">
          <Zap size={16} className="text-[#00ff41] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-[#b8f6c9] text-sm placeholder:text-dimmer"
            placeholder="rechercher un joueur, une page, une action…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Recherche globale"
          />
          <kbd className="border border-[rgba(0,255,65,0.3)] text-dimmer text-[0.6rem] px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Résultats */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto term-scroll" role="listbox" aria-label="Résultats">
          {filtered.length === 0 && (
            <p className="text-dim text-sm text-center py-8">
              {playersLoading ? "recherche…" : "aucun résultat — essaie un pseudo ou « sanction »"}
            </p>
          )}
          {filtered.map((c, i) => {
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            const Icon = c.icon;
            const active = i === sel;
            return (
              <div key={c.id}>
                {showGroup && (
                  <p className="px-4 pt-3 pb-1 text-[0.6rem] uppercase tracking-[0.2em] text-dimmer">{c.group}</p>
                )}
                <button
                  data-idx={i}
                  role="option"
                  aria-selected={active}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-l-2",
                    active
                      ? "bg-[rgba(0,255,65,0.12)] border-[#00ff41] text-[#b8f6c9]"
                      : "border-transparent text-dim hover:bg-[rgba(0,255,65,0.05)]"
                  )}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => runIdx(i)}
                >
                  <Icon size={15} className={active ? "text-[#00ff41]" : "text-dim shrink-0"} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={active ? "glow-soft" : ""}>{c.label}</span>
                    {c.hint && <span className="block text-[0.62rem] text-dimmer truncate">{c.hint}</span>}
                  </span>
                  {active && <span className="text-[0.6rem] text-dimmer shrink-0">↵ entrée</span>}
                </button>
              </div>
            );
          })}
        </div>

        {/* Pied d'aide */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[rgba(0,255,65,0.15)] text-[0.62rem] text-dimmer">
          <span>↑↓ naviguer</span>
          <span>↵ ouvrir</span>
          <span>esc fermer</span>
          <span className="ml-auto hidden sm:inline">ex: « joueur », « ban », « réglages »</span>
        </div>
      </div>
    </div>
  );
}
