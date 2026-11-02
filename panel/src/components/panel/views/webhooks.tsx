"use client";

/** Webhooks Discord: gestion + test */
import { useCallback, useEffect, useState } from "react";
import { api } from "../store";
import { Panel, LoadingLines, EmptyState, fmtRelative } from "../terminal-ui";
import type { WebhookRow } from "@/lib/panel-types";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const EVENT_LABELS: Record<string, string> = {
  "detection.high": "Détections HIGH/CRITICAL",
  ban: "Nouveaux bans",
  unban: "Levées de ban",
  "server.offline": "Serveur hors ligne",
};

export function WebhooksView() {
  const { toast } = useToast();
  const [rows, setRows] = useState<WebhookRow[] | null>(null);
  const [validEvents, setValidEvents] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ webhooks: WebhookRow[]; validEvents: string[] }>("/api/admin/webhooks");
      setRows(d.webhooks);
      setValidEvents(d.validEvents);
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = async (hook: WebhookRow) => {
    try {
      await api(`/api/admin/webhooks/${hook.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !hook.isActive }) });
      load();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const test = async (hook: WebhookRow) => {
    toast({ title: "Envoi du test...", description: hook.name });
    try {
      const res = await api<{ ok: boolean; status: string }>(`/api/admin/webhooks/${hook.id}/test`, { method: "POST" });
      if (res.ok) toast({ title: "Test envoyé", description: "Vérifie le salon Discord." });
      else toast({ title: "Échec du test", description: res.status, variant: "destructive" });
      load();
    } catch (e) {
      toast({ title: "Échec", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const remove = async (hook: WebhookRow) => {
    if (!window.confirm(`Supprimer le webhook "${hook.name}" ?`)) return;
    try {
      await api(`/api/admin/webhooks/${hook.id}`, { method: "DELETE" });
      toast({ title: "Webhook supprimé", description: hook.name });
      load();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Webhooks Discord"
        right={
          <button className="tbtn px-3 h-9 min-h-9 inline-flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> ajouter
          </button>
        }
      >
        {!rows ? (
          <LoadingLines rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState text="Aucun webhook configuré — ajoute un webhook Discord pour recevoir les alertes" />
        ) : (
          <div className="space-y-3">
            {rows.map((h) => {
              const events = (() => { try { return JSON.parse(h.events) as string[]; } catch { return []; } })();
              return (
                <div key={h.id} className="border border-[rgba(0,255,65,0.2)] p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-display text-lg", h.isActive ? "glow" : "text-dim")}>{h.name}</span>
                    <span className={cn("text-[0.62rem] border px-1.5 py-0.5", h.isActive ? "border-[rgba(0,255,65,0.4)] text-[#7dffa8]" : "border-[rgba(255,51,85,0.4)] text-[#ff5577]")}>
                      {h.isActive ? "ACTIF" : "INACTIF"}
                    </span>
                    <div className="ml-auto flex flex-wrap gap-1.5">
                      <button className="tbtn px-2 py-1 h-8 min-h-8 text-[0.65rem] inline-flex items-center gap-1" onClick={() => toggle(h)}>
                        {h.isActive ? "désactiver" : "activer"}
                      </button>
                      <button className="tbtn tbtn-amber px-2 py-1 h-8 min-h-8 text-[0.65rem] inline-flex items-center gap-1" onClick={() => test(h)}>
                        <Zap size={12} /> tester
                      </button>
                      <button className="tbtn tbtn-danger px-2 py-1 h-8 min-h-8 text-[0.65rem]" onClick={() => remove(h)}>suppr.</button>
                    </div>
                  </div>
                  <p className="text-[0.68rem] text-dimmer break-all">{h.url.slice(0, 72)}{h.url.length > 72 ? "..." : ""}</p>
                  <div className="flex flex-wrap gap-1">
                    {events.map((e) => (
                      <span key={e} className="text-[0.62rem] border border-[rgba(53,224,255,0.35)] text-[#7ce8ff] px-1.5 py-0.5">{EVENT_LABELS[e] ?? e}</span>
                    ))}
                  </div>
                  <p className="text-[0.65rem] text-dim">
                    dernier envoi: {h.lastFiredAt ? fmtRelative(h.lastFiredAt) : "jamais"}
                    {h.lastStatus && <> — statut: <span className={h.lastStatus.startsWith("OK") ? "glow-soft" : "glow-red"}>{h.lastStatus}</span></>}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {showCreate && (
        <CreateWebhookDialog
          validEvents={validEvents}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateWebhookDialog({
  validEvents, onClose, onCreated,
}: {
  validEvents: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["detection.high", "ban"]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/admin/webhooks", { method: "POST", body: JSON.stringify({ name: name.trim(), url: url.trim(), events }) });
      toast({ title: "Webhook créé", description: name });
      onCreated();
    } catch (e) {
      toast({ title: "Création refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="Nouveau webhook"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tpanel p-5 w-full max-w-md my-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl glow">Nouveau webhook Discord</h3>
          <button className="tbtn px-2 h-9 min-h-9" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className="space-y-1">
          <label htmlFor="wh-name" className="text-sm text-[#7dffa8]">nom:</label>
          <input id="wh-name" className="tinput w-full px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Staff LS-RP" />
        </div>

        <div className="space-y-1">
          <label htmlFor="wh-url" className="text-sm text-[#7dffa8]">URL webhook Discord:</label>
          <input id="wh-url" className="tinput w-full px-3 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." />
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm text-[#7dffa8]">événements:</legend>
          {validEvents.map((e) => (
            <label key={e} className="flex items-center gap-2 text-sm text-dim cursor-pointer">
              <input
                type="checkbox" className="accent-[#00ff41]"
                checked={events.includes(e)}
                onChange={(ev) => setEvents((prev) => ev.target.checked ? [...prev, e] : prev.filter((x) => x !== e))}
              />
              {EVENT_LABELS[e] ?? e} <span className="text-dimmer">({e})</span>
            </label>
          ))}
        </fieldset>

        <button className="tbtn w-full font-display text-xl" disabled={busy || !name.trim() || !url.trim() || events.length === 0} onClick={submit}>
          {busy ? "CRÉATION..." : "CRÉER LE WEBHOOK"}
        </button>
      </div>
    </div>
  );
}
