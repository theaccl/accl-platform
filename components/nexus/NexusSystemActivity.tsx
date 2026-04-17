import NexusDataStateLabel from "@/components/nexus/NexusDataStateLabel";
import NexusExpandableRow from "@/components/nexus/NexusExpandableRow";
import NexusFreshnessBadge from "@/components/nexus/NexusFreshnessBadge";
import NexusLinkWrapper from "@/components/nexus/NexusLinkWrapper";
import NexusRecoveryHint from "@/components/nexus/NexusRecoveryHint";
import NexusTrustHint, { activityTrustMessage } from "@/components/nexus/NexusTrustHint";
import { nexusModuleHeadingClass, nexusTransition } from "@/components/nexus/NexusHeader";
import { hubHrefFromActivityFeedId, isValidHubHandoffHref } from "@/lib/nexus/nexusRouteHelpers";
import { formatRelativeTimeUtc } from "@/lib/nexus/nexusHubMapping";
import type { NexusActivityKind, NexusSystemActivityState } from "@/lib/nexus/types";

const FINISHED_HREF = "/trainer/review";
const TOURNAMENTS_HREF = "/tournaments";

const typeLabel: Record<string, string> = {
  game_finished: "Game",
  tournament_update: "Tournament",
  player_advance: "Advance",
  system: "System",
};

const kindClarification: Record<NexusActivityKind, string> = {
  game_finished: "From the feed: completed game.",
  tournament_update: "From the feed: tournament update.",
  player_advance: "From the feed: season or progression line.",
  system: "From the feed: system or announcement.",
};

function rowTone(importance: number) {
  if (importance >= 5) {
    return "border-l-[3px] border-l-amber-400/55 bg-[#0f1420] pl-3";
  }
  if (importance >= 4) {
    return "border-l-2 border-l-amber-500/40 bg-[#0f1420]/90 pl-2.5";
  }
  return "border-l border-l-transparent pl-1";
}

function formatPreciseTimestamp(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" });
}

export default function NexusSystemActivity({ state }: { state: NexusSystemActivityState }) {
  const nowMs = Date.now();

  return (
    <section
      className="rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-md shadow-black/15"
      aria-label="System activity"
    >
      <h2 className={nexusModuleHeadingClass}>System activity</h2>
      {state.state === "placeholder" ? (
        <div className="flex min-h-[5.5rem] flex-col items-center justify-center rounded-lg border border-dashed border-[#2a3442]/70 bg-[#0a0e14]/50 px-4 py-8 text-center">
          <NexusDataStateLabel state="placeholder">Activity feed not available.</NexusDataStateLabel>
          <p className="max-w-sm text-sm leading-relaxed text-gray-400">{state.message}</p>
          <div className="max-w-sm">
            <NexusRecoveryHint message="Activity will appear here when the feed is connected." />
          </div>
        </div>
      ) : (
        <ul className="max-h-64 space-y-0 overflow-y-auto pr-1 text-sm">
          {state.items.map((row) => {
            const high = row.importance >= 4;
            const handoffHref = hubHrefFromActivityFeedId(row.id);
            const isGame = Boolean(handoffHref?.startsWith("/game"));
            const activityTrust = handoffHref ? activityTrustMessage(row.type, row.importance) : null;
            return (
              <li
                key={row.id}
                className={`border-b border-[#243244]/50 py-2.5 last:border-0 ${rowTone(row.importance)} ${high ? "hover:bg-[#131b28]/90" : "hover:bg-[#0f1420]/80"} ${nexusTransition}`}
              >
                <NexusExpandableRow
                  isExpandable
                  detailsMaxHeightClass="max-h-52"
                  className="rounded-md border border-transparent"
                  summaryClassName="px-1 py-0.5"
                  summary={
                    <>
                      <p className="text-[13px] leading-snug text-gray-200">{row.message}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="rounded border border-[#2a3442] bg-[#0c1018] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                          {typeLabel[row.type] ?? row.type}
                        </span>
                        <NexusFreshnessBadge timestamp={row.timestamp} nowMs={nowMs} />
                        <span className="text-[11px] text-gray-600" title={row.timestamp}>
                          {formatRelativeTimeUtc(row.timestamp, nowMs)}
                        </span>
                      </div>
                    </>
                  }
                  details={
                    <>
                      <p>
                        <span className="text-gray-500">Recorded (exact): </span>
                        {formatPreciseTimestamp(row.timestamp)}
                      </p>
                      <p className="text-gray-500">{kindClarification[row.type]}</p>
                      {handoffHref ? (
                        <>
                          {activityTrust ? <NexusTrustHint message={activityTrust} /> : null}
                          <p>
                            <NexusLinkWrapper
                              href={handoffHref}
                              isValid
                              title={isGame ? "Opens game view" : "Opens tournament page"}
                              className={`font-medium text-red-300/85 underline-offset-2 ${nexusTransition} hover:underline`}
                            >
                              {isGame ? "Open game" : "Open tournament"}
                            </NexusLinkWrapper>
                          </p>
                        </>
                      ) : (
                        <>
                          <NexusRecoveryHint message="No direct action available for this event." />
                          <p className="mt-1 text-[11px] leading-snug text-gray-500">
                            Check{" "}
                            {isValidHubHandoffHref(FINISHED_HREF) ? (
                              <NexusLinkWrapper
                                href={FINISHED_HREF}
                                isValid
                                title="Opens Trainer review"
                                className="font-medium text-red-300/75 underline-offset-2 hover:underline"
                              >
                                Trainer review
                              </NexusLinkWrapper>
                            ) : (
                              "Trainer review"
                            )}{" "}
                            or{" "}
                            {isValidHubHandoffHref(TOURNAMENTS_HREF) ? (
                              <NexusLinkWrapper
                                href={TOURNAMENTS_HREF}
                                isValid
                                title="Opens tournaments page"
                                className="font-medium text-red-300/75 underline-offset-2 hover:underline"
                              >
                                tournaments
                              </NexusLinkWrapper>
                            ) : (
                              "tournaments"
                            )}{" "}
                            for more detail.
                          </p>
                        </>
                      )}
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
