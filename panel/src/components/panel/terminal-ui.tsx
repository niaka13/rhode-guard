"use client";

/** Primitives UI terminal pour RHODE GUARD */
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

/** Bouton copier en 1 clic avec retour visuel "copié". */
export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback pour navigateurs plus anciens
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copier: ${value.slice(0, 80)}${value.length > 80 ? "…" : ""}`}
      aria-label={label ? `Copier ${label}` : "Copier"}
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[0.62rem] tracking-wider transition-colors shrink-0",
        copied
          ? "border-[rgba(0,255,65,0.6)] text-[#00ff41] bg-[rgba(0,255,65,0.1)]"
          : "border-[rgba(0,255,65,0.25)] text-dim hover:text-[#00ff41] hover:border-[rgba(0,255,65,0.5)]",
        className
      )}
    >
      {copied ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />}
      <span aria-hidden="true">{copied ? "copié" : "copier"}</span>
    </button>
  );
}

export function Panel({
  title,
  right,
  children,
  className,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("tpanel p-4", className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-[rgba(0,255,65,0.18)]">
          <h2 className="font-display text-xl text-glow tracking-wide leading-none">{title}</h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    LOW: "border-[rgba(0,255,65,0.4)] text-[#7dffa8]",
    MEDIUM: "border-[rgba(255,176,0,0.5)] text-[#ffcf66]",
    HIGH: "border-[rgba(255,110,0,0.6)] text-[#ff9448]",
    CRITICAL: "border-[rgba(255,51,85,0.6)] text-[#ff5577]",
  };
  return (
    <span className={cn("inline-block border px-1.5 py-0.5 text-[0.65rem] tracking-widest", styles[severity] ?? styles.LOW)}>
      {severity}
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-block border border-[rgba(53,224,255,0.4)] text-[#7ce8ff] px-1.5 py-0.5 text-[0.65rem] tracking-wider">
      {type.replace("_", "/")}
    </span>
  );
}

export function RiskBar({ score }: { score: number }) {
  const color = score >= 75 ? "#ff3355" : score >= 40 ? "#ffb000" : "#00ff41";
  return (
    <div className="flex items-center gap-2" aria-label={`Score de risque ${score}/100`}>
      <div className="h-2 w-16 border border-[rgba(0,255,65,0.25)] bg-black/60">
        <div className="h-full" style={{ width: `${score}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <span className="text-[0.7rem]" style={{ color }}>{score}</span>
    </div>
  );
}

export function StatBlock({
  label,
  value,
  sub,
  accent = "green",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: "green" | "amber" | "red" | "cyan";
}) {
  const colors = {
    green: "glow",
    amber: "glow-amber",
    red: "glow-red",
    cyan: "glow-cyan",
  };
  return (
    <div className="tpanel p-4 flex flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-[0.18em] text-dim">{label}</span>
      <span className={cn("font-display text-4xl leading-none", colors[accent])}>{value}</span>
      {sub && <span className="text-[0.68rem] text-dimmer">{sub}</span>}
    </div>
  );
}

export function LiveDot({ on, label }: { on: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.7rem]">
      <span
        className={cn("inline-block h-2 w-2 rounded-full pulse-dot", on ? "bg-[#00ff41] text-[#00ff41]" : "bg-[#ff3355] text-[#ff3355]")}
      />
      {label && <span className={on ? "glow-soft" : "glow-red"}>{label}</span>}
    </span>
  );
}

export function LoadingLines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Chargement">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-5 bg-[rgba(0,255,65,0.06)] border-l-2 border-[rgba(0,255,65,0.3)] animate-pulse" style={{ width: `${88 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-dim text-sm py-6 text-center border border-dashed border-[rgba(0,255,65,0.2)]">
      {"//"} {text}
    </p>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function fmtDurationMin(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}
