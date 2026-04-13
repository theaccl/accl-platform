import NexusDataStateLabel from "@/components/nexus/NexusDataStateLabel";
import NexusExpandableRow from "@/components/nexus/NexusExpandableRow";
import NexusFreshnessBadge from "@/components/nexus/NexusFreshnessBadge";
import NexusLinkWrapper from "@/components/nexus/NexusLinkWrapper";
import NexusRecoveryHint from "@/components/nexus/NexusRecoveryHint";
import { nexusModuleHeadingClass, nexusTransition } from "@/components/nexus/NexusHeader";
import { isValidHubHandoffHref } from "@/lib/nexus/nexusRouteHelpers";
import { formatRelativeTimeUtc } from "@/lib/nexus/nexusHubMapping";
import type { NexusRecentResultsState } from "@/lib/nexus/types";

const FREE_PLAY_HREF = "/free";

/**
 * Recent result rows do not carry a game id in the hub payload — no /game/[id] handoff (Phase 7 honesty).
 * If a safe game id is added to the contract later, use lib/nexus/nexusRouteHelpers.buildGameHref.
 */

function formatExactUtc(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" });
}

export default function NexusRecentResults({ state }: { state: NexusRecentResultsState }) {
  const nowMs = Date.now();

  return (
    <section
      className={`rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-md shadow-black/15 ${nexusTransition} hover:shadow-lg hover:shadow-black/20`}
      aria-label="Recent results"
    >
      <h2 className={nexusModuleHeadingClass}>Recent results</h2>
      {state.state === "placeholder" ? (
        <div className="flex min-h-[5.5rem] flex-col items-center justify-center rounded-lg border border-dashed border-[#2a3442]/70 bg-[#0a0e14]/50 px-4 py-8 text-center">
          <NexusDataStateLabel state="placeholder">Recent results not available.</NexusDataStateLabel>
          <p className="max-w-sm text-sm leading-relaxed text-gray-400">{state.message}</p>
          <div className="max-w-sm">
            <NexusRecoveryHint message="No recent results yet. Complete games to see entries here." />
            {isValidHubHandoffHref(FREE_PLAY_HREF) ? (
              <p className="mt-1 text-center text-[11px] text-gray-500">
                <NexusLinkWrapper
                  href={FREE_PLAY_HREF}
                  isValid
                  title="Opens free play"
                  className="font-medium text-red-300/75 underline-offset-2 hover:underline"
                >
                  Go to free play
                </NexusLinkWrapper>
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {state.items.map((row) => (
            <li key={row.id}>
              <NexusExpandableRow
                isExpandable
                detailsMaxHeightClass="max-h-44"
                className={`rounded-lg border px-3 py-2 ${nexusTransition} ${
                  row.tierHighlight
                    ? "border-red-500/25 bg-red-950/10"
                    : "border-[#243244]/70 bg-[#0f1420]/80"
                }`}
                summaryClassName="py-0.5"
                summary={
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-2">
                      <span className="font-medium text-gray-300">{row.playerLabel}</span>
                      <span className="text-[11px] text-gray-500">{row.eventLabel}</span>
                      <span className="text-[11px] text-gray-500">{row.result}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <NexusFreshnessBadge timestamp={row.utc} nowMs={nowMs} />
                      <span className="text-[11px] text-gray-600" title={row.utc}>
                        {row.relativeLabel ?? formatRelativeTimeUtc(row.utc, nowMs)}
                      </span>
                    </div>
                  </div>
                }
                details={
                  <>
                    <p>
                      <span className="text-gray-500">Recorded (exact): </span>
                      <time dateTime={row.utc}>{formatExactUtc(row.utc)}</time>
                    </p>
                    <p>
                      <span className="text-gray-500">Event: </span>
                      {row.eventLabel}
                    </p>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
