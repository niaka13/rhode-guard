"use client";

/** Séquence de démarrage CRT (skippable) */
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const BOOT_LINES = [
  "RHODE GUARD ULTIMATE BIOS v2.0.0 — Rhode RP' +",
  "Initialisation du noyau anti-cheat .......... [ OK ]",
  "Chargement des guards ...................... [ OK ]",
  "  movement | event | combat | vehicle",
  "  economy | inventory | evidence | case",
  "Adapters détectés: es_extended | ox_inventory | oxmysql",
  "Mode par défaut: AUDIT ..................... [ ACTIF ]",
  "  journalise + dossiers auto — sanction auto désactivée",
  "Connexion base de données sanctions ........ [ OK ]",
  "Synchronisation relay temps réel ........... [ OK ]",
  "Handshake API serveurs FiveM ............... [ OK ]",
  "Analyse comportementale + télémétrie croisée [ ACTIF ]",
  "",
  "SYSTÈME OPÉRATIONNEL — ACCÈS EN ATTENTE...",
];

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const finish = useCallback(() => {
    setLeaving((wasLeaving) => {
      if (!wasLeaving) setTimeout(onDone, 400);
      return true;
    });
  }, [onDone]);

  useEffect(() => {
    if (visible >= BOOT_LINES.length) {
      const t = setTimeout(finish, 650);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisible((v) => v + 1), visible === 0 ? 300 : 110);
    return () => clearTimeout(t);
  }, [visible, finish]);

  useEffect(() => {
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, []);

  return (
    <div
      className={cn(
        "crt-flicker fixed inset-0 z-[100] bg-[#020803] overflow-hidden p-4 sm:p-10 transition-opacity duration-400",
        leaving ? "opacity-0" : "opacity-100"
      )}
      role="status"
      aria-label="Démarrage du système"
    >
      <div className="boot-sweep" aria-hidden="true" />
      <pre className="font-display text-[#00ff41] text-[0.5rem] sm:text-xl leading-tight" aria-hidden="true">
{String.raw`██████╗ ██████╗  ██████╗ ██████╗ ███████╗
██╔══██╗██╔══██╗██╔═══██╗██╔══██╗██╔════╝
██████╔╝██████╔╝██║   ██║██║  ██║█████╗
██╔══██╗██╔══██╗██║   ██║██║  ██║██╔══╝
██║  ██║██║  ██║╚██████╔╝██████╔╝███████╗
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
 ██████╗ █████╗  ██████╗ ██████╗ ██████╗
██╔════╝██╔══██╗██╔═══██╗██╔══██╗██╔══██╗
██║     ███████║██║   ██║██████╔╝██║  ██║
██║     ██╔══██║██║   ██║██╔══██╗██║  ██║
╚██████╗██║  ██║╚██████╔╝██║  ██║██████╔╝
 ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝`}
      </pre>
      <div className="mt-4 sm:mt-6 space-y-1 text-[0.7rem] sm:text-sm">
        {BOOT_LINES.slice(0, visible).map((line, i) => (
          <p key={i} className={line.includes("Mode par défaut") || line.includes("AUDIT") ? "glow-amber" : line.includes("OPÉRATIONNEL") ? "glow" : "text-dim"}>
            {line || "\u00A0"}
          </p>
        ))}
        {visible < BOOT_LINES.length && <span className="cursor-blink text-[#00ff41]" />}
      </div>
      <p className="absolute bottom-4 right-6 text-[0.65rem] text-dimmer uppercase tracking-widest">
        appuie sur une touche pour passer
      </p>
    </div>
  );
}
