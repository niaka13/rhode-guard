"use client";

/**
 * Sanction rapide — modal global: chercher un joueur, choisir une durée
 * préréglée et un motif prédéfini, bannir en 1 clic. Accessible depuis
 * le header et la palette (Ctrl+K) sur toutes les vues.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRhode, api } from "./store";
import type { PlayerRow } from "@/lib/panel-types";
import { cn } from "@/lib/utils";
import { Gavel, Search, X } from "lucide-react";

const DURATION_PRESETS = [
  { label: "2 h", hours: 2 },
  { label: "24 h", hours: 24 },
  { label: "48 h", hours: 48 },
  { label: "7 j", hours: 168 },
  { label: "30 j", hours: 720 },
];

const REASON_PRESETS = [
  "Triche avérée (cheat menu)",
  "Aimbot / no-recoil détecté",
  "Duplication d'items (économie)",
  "Exploit de véhicule (god mode)",
  "Comportement toxique répété",
  "Contournement de sanction (alt)",
];

export function QuickSanction() {
  const { quickBanOpen, setQuickBanOpen, toast, permissions, maxTempBanHours, staff } = useRhode();
  const [search, setSearch] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<PlayerRow | null>(null);
  const [duration, setDuration] = useState<number>(48);
  const [perm, setPerm] = useState(false);
  const [hwid, setHwid] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const canPerm = permissions?.canBanPerm ?? false;
  const canHwid = permissions?.canHwidBan ?? false;
  const maxH = maxTempBanHours || 0;

  // Durées filtrées selon le plafond du rôle
  const presets = useMemo(
    () => DURATION_PRESETS.filter((p) => maxH === 0 || p.hours <= maxH),
    [maxH]
  );

  useEffect(() => {
    if (quickBanOpen) {
      setSearch("");
      setPlayers([]);
      setPicked(null);
      setDuration(48);
      setPerm(false);
      setHwid(false);
      setReason("");
      setCustomReason("");
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [quickBanOpen]);

  // Recherche live
  useEffect(() => {
    if (!quickBanOpen || picked) return;
    const term = search.trim();
    if (term.length < 2) {
      setPlayers([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api<{ players: PlayerRow[] }>(
          `/api/admin/players?search=${encodeURIComponent(term)}&pageSize=6`
        );
        setPlayers(res.players ?? []);
      } catch {
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [search, quickBanOpen, picked]);

  if (!quickBanOpen) return null;

  const close = () => setQuickBanOpen(false);

  const finalReason = customReason.trim() || reason;

  const submit = async () => {
    if (busy || !picked || !finalReason) return;
    setBusy(true);
    try {
      await api("/api/admin/bans", {
        method: "POST",
        body: JSON.stringify({
          playerId: picked.id,
          type: perm ? "PERM" : "TEMP",
          durationHours: perm ? undefined : duration,
          reason: finalReason,
          hwidBan: hwid,
        }),
      });
      toast("ok", `Sanction appliquée: ${picked.name}${perm ? " (permanent)" : ` (${duration}h)`}`);
      close();
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "Échec de la sanction");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Sanction rapide"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="tpanel p-5 w-full max-w-lg my-4 space-y-4" onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl glow flex items-center gap-2">
            <Gavel size={20} aria-hidden="true" /> Sanction rapide
          </h2>
          <button className="tbtn px-2 h-9 min-h-9" onClick={close} aria-label="Fermer">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Étape 1: joueur */}
        <div className="space-y-1">
          <p className="text-[0.65rem] uppercase tracking-[0.18em] text-dim">1 — joueur ciblé</p>
          {picked ? (
            <div className="flex items-center justify-between gap-2 border border-[rgba(0,255,65,0.4)] bg-[rgba(0,255,65,0.07)] px-3 py-2">
              <div className="min-w-0">
                <p className="glow truncate">{picked.name}</p>
                <p className="text-[0.62rem] text-dimmer truncate">
                  risque {picked.riskScore} · {picked.detectionCount} détection(s) · {picked.banCount} ban(s)
                </p>
              </div>
              <button className="tbtn px-2 h-8 min-h-8 shrink-0" onClick={() => { setPicked(null); setSearch(""); setTimeout(() => inputRef.current?.focus(), 30); }}>
                changer
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden="true" />
                <input
                  ref={inputRef}
                  className="tinput w-full pl-9 pr-3 text-sm"
                  placeholder="tape un pseudo (min. 2 caractères)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Rechercher le joueur à sanctionner"
                />
              </div>
              {loading && <p className="text-dim text-xs">recherche…</p>}
              {!loading && search.trim().length >= 2 && players.length === 0 && (
                <p className="text-dim text-xs">aucun joueur trouvé</p>
              )}
              {players.length > 0 && (
                <ul className="border border-[rgba(0,255,65,0.25)] divide-y divide-[rgba(0,255,65,0.1)] max-h-44 overflow-y-auto term-scroll">
                  {players.map((p) => (
                    <li key={p.id}>
                      <button
                        className="w-full text-left px-3 py-2 hover:bg-[rgba(0,255,65,0.08)] transition-colors flex items-center gap-2"
                        onClick={() => setPicked(p)}
                      >
                        <span className={p.isOnline ? "text-[#00ff41]" : "text-dimmer"} aria-hidden="true">●</span>
                        <span className="glow-soft text-sm truncate">{p.name}</span>
                        <span className="ml-auto text-[0.62rem] text-dimmer shrink-0">
                          risque {p.riskScore}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Étape 2: durée */}
        <div className="space-y-1.5">
          <p className="text-[0.65rem] uppercase tracking-[0.18em] text-dim">2 — durée</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.hours}
                className={cn("tbtn px-3 h-10 min-h-10", !perm && duration === p.hours && "bg-[rgba(0,255,65,0.16)] glow")}
                onClick={() => { setPerm(false); setDuration(p.hours); }}
                aria-pressed={!perm && duration === p.hours}
              >
                {p.label}
              </button>
            ))}
            {canPerm && (
              <button
                className={cn("tbtn px-3 h-10 min-h-10 glow-red", perm && "bg-[rgba(255,51,85,0.16)]")}
                onClick={() => setPerm(!perm)}
                aria-pressed={perm}
              >
                PERMANENT
              </button>
            )}
          </div>
          {maxH > 0 && !perm && (
            <p className="text-[0.62rem] text-dimmer">
              plafond pour ton rôle ({staff?.role}): {maxH}h
            </p>
          )}
        </div>

        {/* Étape 3: motif */}
        <div className="space-y-1.5">
          <p className="text-[0.65rem] uppercase tracking-[0.18em] text-dim">3 — motif</p>
          <div className="flex flex-wrap gap-1.5">
            {REASON_PRESETS.map((r) => (
              <button
                key={r}
                className={cn(
                  "border px-2 py-1 text-[0.68rem] transition-colors",
                  reason === r && !customReason
                    ? "border-[rgba(0,255,65,0.6)] text-[#00ff41] bg-[rgba(0,255,65,0.1)]"
                    : "border-[rgba(0,255,65,0.2)] text-dim hover:text-[#7dffa8] hover:border-[rgba(0,255,65,0.4)]"
                )}
                onClick={() => { setReason(r); setCustomReason(""); }}
                aria-pressed={reason === r && !customReason}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            className="tinput w-full px-3 text-sm"
            placeholder="ou écris un motif personnalisé…"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            aria-label="Motif personnalisé"
          />
        </div>

        {/* Option HWID */}
        {canHwid && (
          <label className="flex items-center gap-2 text-[0.72rem] text-dim cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hwid}
              onChange={(e) => setHwid(e.target.checked)}
              className="accent-[#00ff41]"
            />
            étendre au HWID (identifiants matériels)
          </label>
        )}

        <button
          className="tbtn tbtn-danger w-full font-display text-xl"
          disabled={busy || !picked || !finalReason || (!perm && presets.length === 0)}
          onClick={submit}
        >
          {busy ? "APPLICATION…" : perm ? "BANNIR DÉFINITIVEMENT" : "APPLIQUER LA SANCTION"}
        </button>

        <p className="text-[0.62rem] text-dimmer leading-relaxed">
          Action immédiate, horodatée et inscrite au journal d&apos;audit.
          Pour un ban réfléchi avec preuves, préfère un dossier (vue Dossiers).
        </p>
      </div>
    </div>
  );
}
