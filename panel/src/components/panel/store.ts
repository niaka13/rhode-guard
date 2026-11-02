"use client";

/** État du panel; les événements sont lus côté serveur avec le cookie HttpOnly. */
import { create } from "zustand";
import type { LiveEvent, StaffInfo, StaffPermissions, GuardMode } from "@/lib/panel-types";

export type Phase = "boot" | "checking" | "login" | "app";
export type ViewId = "dashboard" | "players" | "detections" | "cases" | "sanctions" | "settings" | "staff" | "audit" | "webhooks" | "servers" | "install";
type Toast = { id: number; kind: "ok" | "err" | "info"; text: string };

type RhodeState = {
  phase: Phase; staff: StaffInfo | null; permissions: StaffPermissions | null; maxTempBanHours: number;
  mode: GuardMode; view: ViewId; wsConnected: boolean; events: LiveEvent[]; eventTick: number;
  eventsPerMin: number; toasts: Toast[]; paletteOpen: boolean; quickBanOpen: boolean; helpOpen: boolean;
  focusPlayerId: string | null; setPhase: (p: Phase) => void;
  setSession: (staff: StaffInfo, permissions: StaffPermissions, maxTempBanHours: number, mode?: GuardMode) => void;
  clearSession: () => void; setView: (v: ViewId) => void; setMode: (m: GuardMode) => void;
  pushEvents: (evts: LiveEvent[]) => void; setWsConnected: (b: boolean) => void;
  toast: (kind: Toast["kind"], text: string) => void; dismissToast: (id: number) => void;
  setPaletteOpen: (b: boolean) => void; setQuickBanOpen: (b: boolean) => void;
  setHelpOpen: (b: boolean) => void; setFocusPlayerId: (id: string | null) => void;
};

export const useRhode = create<RhodeState>((set, get) => ({
  phase: "boot", staff: null, permissions: null, maxTempBanHours: 0, mode: "AUDIT", view: "dashboard",
  wsConnected: false, events: [], eventTick: 0, eventsPerMin: 0, toasts: [], paletteOpen: false,
  quickBanOpen: false, helpOpen: false, focusPlayerId: null,
  setPhase: (phase) => set({ phase }),
  setSession: (staff, permissions, maxTempBanHours, mode) => set({ staff, permissions, maxTempBanHours, mode: mode ?? get().mode }),
  clearSession: () => set({ staff: null, permissions: null, events: [], view: "dashboard" }),
  setView: (view) => set({ view }), setMode: (mode) => set({ mode }),
  pushEvents: (incoming) => set((state) => {
    const known = new Set(state.events.map((event) => event.id));
    const fresh = incoming.filter((event) => !known.has(event.id));
    const events = [...fresh, ...state.events].slice(0, 80);
    const cutoff = Date.now() - 60_000;
    return { events, eventTick: state.eventTick + (fresh.length ? 1 : 0), eventsPerMin: events.filter((event) => new Date(event.at).getTime() >= cutoff).length };
  }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  toast: (kind, text) => { const id = Date.now() + Math.random(); set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-4) })); setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200); },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }), setQuickBanOpen: (quickBanOpen) => set({ quickBanOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }), setFocusPlayerId: (focusPlayerId) => set({ focusPlayerId }),
}));

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`);
  return data as T;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;
let cursor = "";

/** Polling same-origin authentifié; aucun jeton de session n'est exposé au JavaScript. */
export function connectRealtime() {
  if (!stopped) return;
  stopped = false;
  cursor = "";
  const store = useRhode;
  const poll = async () => {
    if (stopped) return;
    if (document.visibilityState === "hidden") { pollTimer = setTimeout(poll, 10_000); return; }
    try {
      const query = cursor ? `?since=${encodeURIComponent(cursor)}` : "";
      const result = await api<{ events: LiveEvent[]; cursor: string }>(`/api/admin/events${query}`);
      if (result.events.length) store.getState().pushEvents(result.events);
      cursor = result.cursor;
      store.getState().setWsConnected(true);
      pollTimer = setTimeout(poll, 5_000);
    } catch {
      store.getState().setWsConnected(false);
      pollTimer = setTimeout(poll, 15_000);
    }
  };
  void poll();
}

export function disconnectRealtime() {
  stopped = true;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  useRhode.getState().setWsConnected(false);
}
