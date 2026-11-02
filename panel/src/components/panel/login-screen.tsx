"use client";

/** Écran de connexion terminal + appel de sanction public (joueurs bannis) */
import { useRef, useState } from "react";
import { api } from "./store";
import type { StaffInfo, StaffPermissions, GuardMode } from "@/lib/panel-types";
import { cn } from "@/lib/utils";

export function LoginScreen({
  onLogin,
}: {
  onLogin: (staff: StaffInfo, permissions: StaffPermissions, maxTempBanHours: number, mode: GuardMode) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAppeal, setShowAppeal] = useState(false);
  const [logs, setLogs] = useState<string[]>(["[INFO] Connecte-toi avec un compte staff configuré."]);
  const passRef = useRef<HTMLInputElement>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ staff: StaffInfo }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setLogs((l) => [...l, `[OK] session établie — ${res.staff.username}`]);
      const me = await api<{ staff: StaffInfo; permissions: StaffPermissions; maxTempBanHours: number; mode: GuardMode }>("/api/admin/me");
      setTimeout(() => onLogin(res.staff, me.permissions, me.maxTempBanHours, me.mode), 350);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Échec de connexion";
      setError(msg);
      setLogs((l) => [...l, `[ERREUR] ${msg}`]);
      setBusy(false);
    }
  };

  return (
    <div className="crt-flicker min-h-screen bg-[#020803] flex items-center justify-center p-4">
      <div className="w-full max-w-3xl grid md:grid-cols-[1.2fr_1fr] gap-6">
        {/* Formulaire */}
        <form onSubmit={submit} className="tpanel p-6 space-y-5" aria-label="Connexion staff">
          <div>
            <h1 className="font-display text-3xl glow leading-none">RHODE GUARD</h1>
            <p className="text-dim text-xs mt-1 tracking-widest uppercase">Panel anti-cheat — accès restreint</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="login-user" className="text-[#7dffa8] text-sm">login:</label>
            <input
              id="login-user"
              className="tinput w-full px-3"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="login-pass" className="text-[#7dffa8] text-sm">password:</label>
            <input
              id="login-pass"
              ref={passRef}
              type="password"
              className="tinput w-full px-3"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="glow-red text-sm">[ACCÈS REFUSÉ] {error}</p>}

          <button type="submit" disabled={busy || !username.trim() || !password} className={cn("tbtn w-full px-4 font-display text-xl", busy && "animate-pulse")}>
            {busy ? "AUTHENTIFICATION..." : "SE CONNECTER"}
          </button>

          <div className="border-t border-[rgba(0,255,65,0.15)] pt-3 text-[0.68rem] text-dimmer leading-relaxed">
            Toute tentative d&apos;accès est enregistrée dans le journal d&apos;audit.
            Après 8 échecs / 10 min, l&apos;adresse est bloquée temporairement.
          </div>

          <button
            type="button"
            className="text-[0.7rem] text-[#7ce8ff] underline underline-offset-4 hover:text-[#00ff41] transition-colors"
            onClick={() => setShowAppeal(true)}
          >
            joueur banni ? faire appel de sa sanction →
          </button>
        </form>

        {/* État d'accès, sans comptes de démonstration ni secrets intégrés */}
        <div className="space-y-4">
          <div className="tpanel p-4" aria-label="Journal système">
            <h2 className="font-display text-lg text-glow mb-2">syslog</h2>
            <div className="space-y-1 text-[0.7rem] max-h-36 overflow-y-auto term-scroll">
              {logs.map((l, i) => (
                <p key={i} className={l.startsWith("[ERREUR]") ? "glow-red" : "text-dim"}>{l}</p>
              ))}
              <span className="cursor-blink text-[#00ff41] text-[0.7rem]" />
            </div>
          </div>
          <div className="tpanel p-4 text-sm text-dim">
            <h2 className="font-display text-lg text-glow mb-2">Accès sécurisé</h2>
            Les comptes de démonstration ont été retirés. Seuls les comptes staff créés et activés sur la base du panel peuvent se connecter.
          </div>
        </div>
      </div>

      {showAppeal && <AppealDialog onClose={() => setShowAppeal(false)} />}
    </div>
  );
}

/** Modal public d'appel de sanction — accessible sans compte staff. */
function AppealDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"form" | "status">("form");
  const [license, setLicense] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [statement, setStatement] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusResult, setStatusResult] = useState<{ status: string; decidedAt: string | null; decisionNote: string | null } | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<{ ok: boolean }>('/api/appeal', {
        method: 'POST',
        body: JSON.stringify({ license: license.trim(), playerName: playerName.trim(), statement: statement.trim(), contact: contact.trim() }),
      });
      if (res.ok) {
        setResult('Appel transmis. Le staff l\u2019examinera — vérifie son statut ici avec ta licence.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de l\u2019envoi');
    } finally {
      setBusy(false);
    }
  };

  const checkStatus = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatusResult(null);
    try {
      const res = await api<{ status: string; decidedAt: string | null; decisionNote: string | null }>(
        `/api/appeal?license=${encodeURIComponent(license.trim())}`
      );
      setStatusResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la requête');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Appel de sanction"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tpanel p-5 w-full max-w-lg my-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl glow-cyan">Appel de sanction</h2>
          <button className="tbtn px-2 h-9 min-h-9" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="flex gap-1" role="tablist" aria-label="Mode de l'appel">
          <button role="tab" aria-selected={mode === "form"} className={cn("tbtn flex-1", mode === "form" && "bg-[rgba(0,255,65,0.16)] glow")} onClick={() => setMode("form")}>contester</button>
          <button role="tab" aria-selected={mode === "status"} className={cn("tbtn flex-1", mode === "status" && "bg-[rgba(0,255,65,0.16)] glow")} onClick={() => setMode("status")}>suivre</button>
        </div>

        <div className="space-y-1">
          <label htmlFor="ap-license" className="text-sm text-[#7dffa8]">licence FiveM:</label>
          <input
            id="ap-license"
            className="tinput w-full px-3 text-sm"
            placeholder="license:xxxxxxxxxxxxxxxxxxxx"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
          />
          <p className="text-[0.65rem] text-dimmer">
            Ta licence est visible dans les fichiers de ton client FiveM (fichier license.data) ou auprès du staff.
          </p>
        </div>

        {mode === "form" ? (
            <>
              <div className="space-y-1">
                <label htmlFor="ap-name" className="text-sm text-[#7dffa8]">pseudo (optionnel):</label>
                <input id="ap-name" className="tinput w-full px-3 text-sm" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label htmlFor="ap-statement" className="text-sm text-[#7dffa8]">ta version des faits (min. 30 caractères):</label>
                <textarea
                  id="ap-statement"
                  className="tinput w-full px-3 py-2 text-sm min-h-28"
                  placeholder="Explique le contexte, ce que tu faisais, tout élément utile à la revue…"
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="ap-contact" className="text-sm text-[#7dffa8]">contact Discord (optionnel):</label>
                <input id="ap-contact" className="tinput w-full px-3 text-sm" placeholder="pseudo#0000" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>
              <button
                className="tbtn w-full font-display text-xl"
                disabled={busy || !license.trim().startsWith("license:") || statement.trim().length < 30}
                onClick={submit}
              >
                {busy ? "TRANSMISSION…" : "SOUMETTRE L'APPEL"}
              </button>
              <p className="text-[0.65rem] text-dimmer leading-relaxed">
                Un seul appel par sanction. Toute soumission est horodatée et enregistrée;
                les décisions du staff sont motivées et finales.
              </p>
            </>
          ) : (
            <>
              <button className="tbtn w-full font-display text-lg" disabled={busy || !license.trim().startsWith("license:")} onClick={checkStatus}>
                {busy ? "RECHERCHE…" : "VÉRIFIER LE STATUT"}
              </button>
              {statusResult && (
                <div className="border border-[rgba(0,255,65,0.25)] p-3 space-y-1 text-sm">
                  <p>
                    statut: {" "}
                    {statusResult.status === "PENDING" && <span className="glow-amber">EN EXAMEN</span>}
                    {statusResult.status === "ACCEPTED" && <span className="glow">ACCEPTÉ — sanction levée</span>}
                    {statusResult.status === "REJECTED" && <span className="glow-red">REJETÉ — sanction maintenue</span>}
                  </p>
                  {statusResult.decidedAt && (
                    <p className="text-dim text-xs">décision du {new Date(statusResult.decidedAt).toLocaleString("fr-FR")}</p>
                  )}
                  {statusResult.decisionNote && (
                    <p className="text-dim text-xs">motif: {statusResult.decisionNote}</p>
                  )}
                </div>
              )}
            </>
          )}

        {error && <p className="glow-red text-sm">[REFUSÉ] {error}</p>}
        {result && <p className="glow text-sm">[OK] {result}</p>}
      </div>
    </div>
  );
}
