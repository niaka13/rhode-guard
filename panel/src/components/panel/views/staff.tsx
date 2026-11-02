"use client";

/** Staff: gestion des comptes et rôles (OWNER) */
import { useCallback, useEffect, useState } from "react";
import { api } from "../store";
import { Panel, LoadingLines, EmptyState, fmtDate, fmtRelative } from "../terminal-ui";
import type { StaffRow } from "@/lib/panel-types";
import { ROLE_LABELS } from "@/lib/panel-types";
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLES = ["OWNER", "ADMIN", "MODERATOR", "SUPPORT"] as const;

const ROLE_DESC: Record<string, string> = {
  OWNER: "accès total: staff, serveurs, clés API, audit",
  ADMIN: "bans permanents, HWID, webhooks, audit",
  MODERATOR: "bans temporaires (7 jours max)",
  SUPPORT: "lecture seule: dashboard, joueurs, détections",
};

export function StaffView() {
  const { toast } = useToast();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ staff: StaffRow[] }>("/api/admin/staff")).staff);
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/admin/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast({ title: "Compte mis à jour" });
      load();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const remove = async (row: StaffRow) => {
    if (!window.confirm(`Supprimer définitivement le compte "${row.username}" ?`)) return;
    try {
      await api(`/api/admin/staff/${row.id}`, { method: "DELETE" });
      toast({ title: "Compte supprimé", description: row.username });
      load();
    } catch (e) {
      toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Comptes staff"
        right={
          <button className="tbtn px-3 h-9 min-h-9 inline-flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> ajouter
          </button>
        }
      >
        {!rows ? (
          <LoadingLines rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState text="Aucun compte staff" />
        ) : (
          <div className="overflow-x-auto term-scroll">
            <table className="ttable">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th className="hidden md:table-cell">Dernière connexion</th>
                  <th className="hidden lg:table-cell">Bans émis</th>
                  <th>Actif</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className={s.isActive ? undefined : "opacity-40"}>
                    <td className="glow-soft">{s.username}</td>
                    <td>
                      <select
                        className="tinput px-2 py-1 h-9 min-h-9 text-[0.7rem] w-36"
                        value={s.role}
                        disabled={s.username === "owner"}
                        onChange={(e) => patch(s.id, { role: e.target.value })}
                        aria-label={`Rôle de ${s.username}`}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td className="hidden md:table-cell text-dim">{s.lastLoginAt ? fmtRelative(s.lastLoginAt) : "jamais"}</td>
                    <td className="hidden lg:table-cell text-[#ffcf66]">{s._count.bansCreated}</td>
                    <td>
                      <button
                        className={cn("tbtn px-2 py-1 h-8 min-h-8 text-[0.65rem]", s.isActive && "tbtn-amber")}
                        disabled={s.username === "owner"}
                        onClick={() => patch(s.id, { isActive: !s.isActive })}
                      >
                        {s.isActive ? "désactiver" : "activer"}
                      </button>
                    </td>
                    <td>
                      <button className="tbtn tbtn-danger px-2 py-1 h-8 min-h-8 text-[0.65rem]" disabled={s.username === "owner"} onClick={() => remove(s)}>
                        suppr.
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[0.68rem] text-dimmer mt-3">Le compte owner ne peut être ni modifié ni supprimé (protection système).</p>
      </Panel>

      <Panel title="Matrice des permissions">
        <div className="grid sm:grid-cols-2 gap-2 text-[0.72rem]">
          {ROLES.map((r) => (
            <div key={r} className="border border-[rgba(0,255,65,0.2)] p-3">
              <p className="glow mb-1">{ROLE_LABELS[r]} <span className="text-dimmer">({r})</span></p>
              <p className="text-dim">{ROLE_DESC[r]}</p>
            </div>
          ))}
        </div>
      </Panel>

      {showCreate && (
        <CreateStaffDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateStaffDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("SUPPORT");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/admin/staff", { method: "POST", body: JSON.stringify({ username: username.trim(), password, role }) });
      toast({ title: "Compte créé", description: `${username} — ${ROLE_LABELS[role]}` });
      onCreated();
    } catch (e) {
      toast({ title: "Création refusée", description: e instanceof Error ? e.message : "", variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="Nouveau compte staff"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tpanel p-5 w-full max-w-md my-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl glow">Nouveau compte staff</h3>
          <button className="tbtn px-2 h-9 min-h-9" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className="space-y-1">
          <label htmlFor="staff-user" className="text-sm text-[#7dffa8]">utilisateur:</label>
          <input id="staff-user" className="tinput w-full px-3 text-sm" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="staff-pass" className="text-sm text-[#7dffa8]">mot de passe (6+):</label>
          <input id="staff-pass" type="password" className="tinput w-full px-3 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="staff-role" className="text-sm text-[#7dffa8]">rôle:</label>
          <select id="staff-role" className="tinput w-full px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_DESC[r]}</option>)}
          </select>
        </div>

        <button className="tbtn w-full font-display text-xl" disabled={busy || username.trim().length < 3 || password.length < 6} onClick={submit}>
          {busy ? "CRÉATION..." : "CRÉER LE COMPTE"}
        </button>
      </div>
    </div>
  );
}
