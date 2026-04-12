"use client";

import { useEffect, useState } from "react";

/** Client-side countdown only — target is server-provided ISO UTC. */
export default function ChampionshipCountdown({
  targetIso,
  k12,
}: {
  targetIso: string;
  k12: boolean;
}) {
  const [label, setLabel] = useState<string>(() => formatRemaining(targetIso));

  useEffect(() => {
    const t = window.setInterval(() => setLabel(formatRemaining(targetIso)), 1000);
    return () => window.clearInterval(t);
  }, [targetIso]);

  return (
    <p className={`text-sm font-semibold ${k12 ? "text-cyan-100" : "text-amber-100"}`}>
      {k12 ? "Starts in " : "Starts in "}
      {label}
    </p>
  );
}

function formatRemaining(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const ms = Math.max(0, t - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
