"use client";

/**
 * RHODE GUARD ULTIMATE — Panel anti-cheat FiveM
 * Flux: séquence boot → vérification session → login → application
 */
import { useEffect, useState } from "react";
import { BootScreen } from "@/components/panel/boot-screen";
import { LoginScreen } from "@/components/panel/login-screen";
import { RhodeApp } from "@/components/panel/rhode-app";
import { api, useRhode, connectRealtime } from "@/components/panel/store";
import type { StaffInfo, StaffPermissions, GuardMode } from "@/lib/panel-types";

export default function Home() {
  const { phase, setPhase, setSession, setMode } = useRhode();
  const [booted, setBooted] = useState(false);

  // Vérifie la session existante dès la fin du boot
  useEffect(() => {
    if (!booted || phase !== "checking") return;
    (async () => {
      try {
        const me = await api<{ staff: StaffInfo; permissions: StaffPermissions; maxTempBanHours: number; mode: GuardMode }>("/api/admin/me");
        setSession(me.staff, me.permissions, me.maxTempBanHours, me.mode);
        setMode(me.mode);
        connectRealtime();
        setPhase("app");
      } catch {
        setPhase("login");
      }
    })();
  }, [booted, phase, setPhase, setSession, setMode]);

  if (!booted) {
    return <BootScreen onDone={() => { setBooted(true); setPhase("checking"); }} />;
  }

  if (phase === "checking") {
    return (
      <div className="min-h-screen bg-[#020803] flex items-center justify-center" role="status" aria-label="Vérification de session">
        <p className="glow text-sm cursor-blink">VÉRIFICATION DE SESSION</p>
      </div>
    );
  }

  if (phase === "login") {
    return (
      <LoginScreen
        onLogin={(staff, permissions, maxTempBanHours, mode) => {
          setSession(staff, permissions, maxTempBanHours, mode);
          setMode(mode);
          connectRealtime();
          setPhase("app");
        }}
      />
    );
  }

  return <RhodeApp />;
}
