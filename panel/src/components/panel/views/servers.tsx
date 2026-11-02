"use client";

/** Serveurs de jeu: clés API, heartbeats */
import { useCallback, useEffect, useState } from "react";
import { api, useRhode } from "../store";
import { Panel, LoadingLines, EmptyState, LiveDot, fmtRelative } from "../terminal-ui";
import type { ServerRow } from "@/lib/panel-types";
import { useToast } from "@/hooks/use-toast";
import { Copy, KeyRound, Plus, RefreshCw, Trash2, X } from "lucide-react";

export function ServersView() {
  const { toast } = useToast();
  const { eventTick } = useRhode();
  const [rows, setRows] = useState<ServerRow[] | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ servers: ServerRow[] }>("/api/admin/servers")).servers);
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    if (eventTick > 0) {
      const t = setTimeout(load, 0);
      return () => clearTimeout(t);
    }
  }, [eventTick]);

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast({ title: "Clé copiée", description: "Colle-la dans config.lua (Config.ApiKey)" });
    } catch {
      toast({ title: "Copie impossible", description: "Copie manuellement la clé affichée", variant: "destructive" });
    }
  };

  const regenerate = async (s: ServerRow) => {
    if (!window.confirm(`Régénérer la clé de "${s.name}" ? La ressource FiveM devra être mise à jour.`)) return;
    try {
      const res = await api<{ apiKey: string }>(`/api/admin/servers/${s.id}`, { method: "PATCH", body: JSON.stringify({ regenerateKey: true }) });
      toast({ title: "Clé régénérée", description: res.apiKey.slice(0, 12) + "..." });
      load();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const remove = async (s: ServerRow) => {
    if (!window.confirm(`Supprimer "${s.name}" ? Ses détections seront supprimées.`)) return;
    try {
      await api(`/api/admin/servers/${s.id}`, { method: "DELETE" });
      toast({ title: "Serveur supprimé", description: s.name });
      load();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Serveurs FiveM enregistrés"
        right={
          <button className="tbtn px-3 h-9 min-h-9 inline-flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> ajouter
          </button>
        }
      >
        {!rows ? (
          <LoadingLines rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState text="Aucun serveur — ajoute ton serveur FiveM pour obtenir une clé API" />
        ) : (
          <div className="space-y-3">
            {rows.map((s) => (
              <div key={s.id} className="border border-[rgba(0,255,65,0.2)] p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <LiveDot on={s.isOnline} />
                  <span className="font-display text-lg glow-soft">{s.name}</span>
                  <span className="text-[0.68rem] text-dim">{s.ip ?? "IP inconnue"}</span>
                  <span className="text-[0.68rem] text-dim ml-auto">
                    {s.onlinePlayers}/{s.maxPlayers} joueurs — HB {fmtRelative(s.lastHeartbeat)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <KeyRound size={14} className="text-[#ffb000]" aria-hidden="true" />
                  <code className="text-[0.7rem] text-[#ffcf66] bg-black/50 px-2 py-1 border border-[rgba(255,176,0,0.3)] flex-1 min-w-40 truncate">
                    {revealed[s.id] ? s.apiKey : s.apiKey.slice(0, 8) + "•".repeat(28)}
                  </code>
                  <button className="tbtn px-2 py-1 h-8 min-h-8 text-[0.65rem]" onClick={() => setRevealed((r) => ({ ...r, [s.id]: !r[s.id] }))}>
                    {revealed[s.id] ? "masquer" : "révéler"}
                  </button>
                  <button className="tbtn px-2 py-1 h-8 min-h-8 text-[0.65rem] inline-flex items-center gap-1" onClick={() => copyKey(s.apiKey)}>
                    <Copy size={12} /> copier
                  </button>
                  <button className="tbtn tbtn-amber px-2 py-1 h-8 min-h-8 text-[0.65rem] inline-flex items-center gap-1" onClick={() => regenerate(s)}>
                    <RefreshCw size={12} /> régénérer
                  </button>
                  <button className="tbtn tbtn-danger px-2 py-1 h-8 min-h-8 text-[0.65rem] inline-flex items-center gap-1" onClick={() => remove(s)}>
                    <Trash2 size={12} /> suppr.
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[0.68rem] text-dimmer mt-3">
          Un serveur passe hors ligne si aucun heartbeat n&apos;est reçu pendant quelques minutes (la ressource envoie un heartbeat toutes les 60 s).
        </p>
      </Panel>

      {showCreate && (
        <CreateServerDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateServerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(64);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/admin/servers", { method: "POST", body: JSON.stringify({ name: name.trim(), ip: ip.trim(), maxPlayers }) });
      toast({ title: "Serveur ajouté", description: "Copie la clé API générée dans config.lua" });
      onCreated();
    } catch (e) {
      toast({ title: "Création refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="Nouveau serveur"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tpanel p-5 w-full max-w-md my-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl glow">Nouveau serveur FiveM</h3>
          <button className="tbtn px-2 h-9 min-h-9" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="space-y-1">
          <label htmlFor="srv-name" className="text-sm text-[#7dffa8]">nom:</label>
          <input id="srv-name" className="tinput w-full px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: FR — Los Santos RP | 02" />
        </div>
        <div className="space-y-1">
          <label htmlFor="srv-ip" className="text-sm text-[#7dffa8]">ip:port (optionnel):</label>
          <input id="srv-ip" className="tinput w-full px-3 text-sm" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="51.83.72.19:30120" />
        </div>
        <div className="space-y-1">
          <label htmlFor="srv-max" className="text-sm text-[#7dffa8]">slots:</label>
          <input id="srv-max" type="number" min={1} max={1024} className="tinput w-full px-3 text-sm" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
        </div>
        <button className="tbtn w-full font-display text-xl" disabled={busy || !name.trim()} onClick={submit}>
          {busy ? "CRÉATION..." : "ENREGISTRER & GÉNÉRER LA CLÉ"}
        </button>
      </div>
    </div>
  );
}
