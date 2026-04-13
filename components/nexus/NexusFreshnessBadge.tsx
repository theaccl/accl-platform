export type FreshnessLevel = "live" | "recent" | "updated" | "stale";

export type FreshnessMeta = {
  label: string;
  level: FreshnessLevel;
  /** Tailwind class for text + border */
  className: string;
};

/**
 * Truthful freshness from a single ISO timestamp vs `nowMs` (no timers).
 * Thresholds: ≤2m Live, ≤15m Recent, ≤1h Updated, else Stale.
 */
export function getFreshnessMeta(timestamp: string | undefined, nowMs: number): FreshnessMeta | null {
  if (!timestamp?.trim()) return null;
  const t = Date.parse(timestamp);
  if (!Number.isFinite(t)) return null;
  const ageSec = (nowMs - t) / 1000;
  if (ageSec < 0) {
    return {
      label: "Recent",
      level: "recent",
      className: "border-sky-500/25 text-sky-400/75",
    };
  }
  if (ageSec <= 120) {
    return {
      label: "Live",
      level: "live",
      className: "border-emerald-500/30 text-emerald-400/80",
    };
  }
  if (ageSec <= 15 * 60) {
    return {
      label: "Recent",
      level: "recent",
      className: "border-sky-500/25 text-sky-400/75",
    };
  }
  if (ageSec <= 3600) {
    return {
      label: "Updated",
      level: "updated",
      className: "border-gray-600/35 text-gray-400",
    };
  }
  return {
    label: "Stale",
    level: "stale",
    className: "border-amber-700/35 text-amber-600/85",
  };
}

type NexusFreshnessBadgeProps = {
  timestamp?: string;
  /** For tests / SSR; defaults to Date.now() */
  nowMs?: number;
};

/** Small text badge — label is always visible (not color-only). */
export default function NexusFreshnessBadge({ timestamp, nowMs = Date.now() }: NexusFreshnessBadgeProps) {
  const meta = getFreshnessMeta(timestamp, nowMs);
  if (!meta) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.className}`}
      title={`${meta.label} — from recorded time`}
    >
      {meta.label}
    </span>
  );
}
