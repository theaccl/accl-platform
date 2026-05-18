import type { NexusHubPayload } from "@/lib/nexus/types";
import { UtcClock } from "@/components/UtcClock";
import { leagueCardSurfaceClasses } from "@/components/ui/LeagueCard";
import { formatRelativeTimeUtc } from "@/lib/nexus/nexusHubMapping";

/** Shared with module titles — scan-aligned label style */
export const nexusModuleHeadingClass =
  "mb-3 text-[length:var(--accl-text-xs)] font-semibold uppercase tracking-[var(--accl-tracking-wide)] text-[var(--accl-text-faint)]";

/**
 * Phase 4 — consistent interaction timing (120–180ms, ease-out).
 * Use on interactive surfaces; motion-reduce disables transitions.
 */
export const nexusTransition =
  "transition-[background-color,border-color,box-shadow,transform,opacity,color] duration-150 ease-out motion-reduce:duration-0 motion-reduce:transition-none";

/** For elements that should not scale under reduced motion */
export const nexusInteractiveLift =
  `${nexusTransition} motion-safe:hover:scale-[1.01] motion-safe:active:scale-[0.99] motion-reduce:hover:scale-100 motion-reduce:active:scale-100`;

type Props = {
  meta: NexusHubPayload["meta"];
  className?: string;
};

export default function NexusHeader({ meta, className = "" }: Props) {
  const t = new Date(meta.generatedAt);
  const utcDisplay = Number.isFinite(t.getTime())
    ? t.toLocaleString(undefined, {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : String(meta.generatedAt);
  const generatedRelative = formatRelativeTimeUtc(meta.generatedAt);

  return (
    <header
      className={`${leagueCardSurfaceClasses} px-5 py-4 ${nexusTransition} ${className}`.trim()}
    >
      <p className="text-[length:var(--accl-text-2xs)] uppercase tracking-[var(--accl-tracking-wider)] text-[var(--accl-text-faint)]">
        ACCL
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">NEXUS</h1>
          <p className="mt-0.5 text-sm text-gray-500">Live command center</p>
        </div>
        <div className="text-right">
          <UtcClock variant="stacked" className="min-w-[140px]" />
          <p className="mt-1 text-[11px] text-gray-500" title={`${meta.generatedAt} (UTC)`}>
            <span className="font-semibold uppercase tracking-wide text-gray-400">Snapshot</span>{" "}
            <span className="tabular-nums text-gray-300">{utcDisplay}</span>
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-gray-600" title={meta.generatedAt}>
            Hub data {generatedRelative}
          </p>
        </div>
      </div>
    </header>
  );
}
