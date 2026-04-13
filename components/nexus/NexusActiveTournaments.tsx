import NexusDataStateLabel from "@/components/nexus/NexusDataStateLabel";
import NexusExpandableRow from "@/components/nexus/NexusExpandableRow";
import NexusFreshnessBadge from "@/components/nexus/NexusFreshnessBadge";
import NexusLinkWrapper from "@/components/nexus/NexusLinkWrapper";
import NexusRecoveryHint from "@/components/nexus/NexusRecoveryHint";
import NexusTrustHint, { trustMessageForTournamentRow } from "@/components/nexus/NexusTrustHint";
import { nexusModuleHeadingClass, nexusTransition } from "@/components/nexus/NexusHeader";
import { buildTournamentHref, isValidHubHandoffHref } from "@/lib/nexus/nexusRouteHelpers";
import { formatRelativeTimeUtc, isSafeHubDocumentId } from "@/lib/nexus/nexusHubMapping";
import type { NexusTournamentRow, NexusTournamentSnapshotState } from "@/lib/nexus/types";

const TOURNAMENTS_HREF = "/tournaments";

function formatExactUpdated(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

function tournamentStatusExplainer(status: string): string {
  const s = String(status).toLowerCase().trim();
  if (s === "active") return "Tournament is active and ongoing.";
  if (s === "in_progress" || s === "live") return "Matches or bracket activity is in progress.";
  return `Recorded status: ${status}.`;
}

export default function NexusActiveTournaments({ state }: { state: NexusTournamentSnapshotState }) {
  const nowMs = Date.now();

  return (
    <section
      className="rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-md shadow-black/15"
      aria-label="Active tournaments"
    >
      <h2 className={nexusModuleHeadingClass}>Active tournaments</h2>
      {state.state === "placeholder" ? (
        <div className="flex min-h-[5.5rem] flex-col items-center justify-center rounded-lg border border-dashed border-[#2a3442]/70 bg-[#0a0e14]/50 px-4 py-8 text-center">
          <NexusDataStateLabel state="placeholder">Tournament snapshot not available.</NexusDataStateLabel>
          <p className="max-w-sm text-sm leading-relaxed text-gray-400">{state.message}</p>
          <div className="max-w-sm">
            <NexusRecoveryHint message="Browse the tournaments area when listings are available." />
            {isValidHubHandoffHref(TOURNAMENTS_HREF) ? (
              <p className="mt-1 text-center text-[11px] text-gray-500">
                <NexusLinkWrapper
                  href={TOURNAMENTS_HREF}
                  isValid
                  title="Opens tournaments page"
                  className="font-medium text-red-300/80 underline-offset-2 hover:underline"
                >
                  Go to tournaments
                </NexusLinkWrapper>
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {state.items.map((row) => {
            const tournamentTrust = trustMessageForTournamentRow(
              Boolean(row.userHasActiveGame),
              Boolean(row.userParticipating),
            );
            return (
            <li key={row.id}>
              {isSafeHubDocumentId(row.id) ? (
                <NexusExpandableRow
                  isExpandable
                  detailsMaxHeightClass="max-h-56"
                  className={`${nexusTransition} rounded-lg border bg-[#0f1420] ${
                    row.userHasActiveGame || row.userParticipating
                      ? "border-red-500/30 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.1)]"
                      : "border-[#243244]"
                  }`}
                  summaryClassName="px-3 py-2.5"
                  summary={
                    <>
                      <p className="text-[15px] font-medium leading-snug text-gray-100">{row.name}</p>
                      {(row.userParticipating || row.userHasActiveGame) && (
                        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium">
                          {row.userHasActiveGame ? (
                            <span className="text-amber-200/85">Active game</span>
                          ) : null}
                          {row.userParticipating ? (
                            <span className="text-red-300/85">You are in this event</span>
                          ) : null}
                        </p>
                      )}
                      {tournamentTrust ? <NexusTrustHint message={tournamentTrust} /> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                        {row.tierLabel ? (
                          <span className="rounded border border-[#2a3442]/80 bg-[#0c1018] px-1.5 py-0.5 text-gray-500">
                            {row.tierLabel}
                          </span>
                        ) : null}
                        <span className="text-gray-500">{row.status}</span>
                        {row.stageLabel ? <span className="text-gray-500">· {row.stageLabel}</span> : null}
                        {row.updatedAt ? (
                          <>
                            <NexusFreshnessBadge timestamp={row.updatedAt} nowMs={nowMs} />
                            <span className="text-gray-500" title={row.updatedAt}>
                              · {formatRelativeTimeUtc(row.updatedAt, nowMs)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </>
                  }
                  details={
                    <TournamentDetails row={row} />
                  }
                />
              ) : (
                <div className="cursor-default rounded-lg border border-[#243244] bg-[#0f1420] px-3 py-2.5 text-sm text-gray-400">
                  <p>
                    {row.name} ({row.status})
                  </p>
                  <NexusRecoveryHint message="Tournament details not available. Check the tournaments page." />
                  {isValidHubHandoffHref(TOURNAMENTS_HREF) ? (
                    <p className="mt-1 text-[11px] text-gray-500">
                      <NexusLinkWrapper
                        href={TOURNAMENTS_HREF}
                        isValid
                        title="Opens tournaments page"
                        className="font-medium text-red-300/80 underline-offset-2 hover:underline"
                      >
                        Go to tournaments
                      </NexusLinkWrapper>
                    </p>
                  ) : null}
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TournamentDetails({ row }: { row: NexusTournamentRow }) {
  const tourHref = buildTournamentHref(row.id);
  const canNavigate = Boolean(tourHref && isValidHubHandoffHref(tourHref));

  return (
    <>
      {row.updatedAt ? (
        <p>
          <span className="text-gray-500">Recorded (exact): </span>
          {formatExactUpdated(row.updatedAt)}
        </p>
      ) : null}
      <p>{tournamentStatusExplainer(row.status)}</p>
      {(row.userHasActiveGame || row.userParticipating) && (
        <ul className="list-inside list-disc text-gray-400">
          {row.userHasActiveGame ? <li>You have an active game in this tournament.</li> : null}
          {row.userParticipating ? <li>You are participating in this tournament.</li> : null}
        </ul>
      )}
      <div className="space-y-1">
        <p>
          <NexusLinkWrapper
            href={tourHref || undefined}
            isValid={canNavigate}
            title="Opens tournament page"
            className={`font-medium text-red-300/90 underline-offset-2 ${nexusTransition} ${canNavigate ? "hover:underline" : ""}`}
          >
            Open tournament
          </NexusLinkWrapper>
        </p>
        {canNavigate ? (
          <p className="text-[10px] text-gray-600">View full tournament details</p>
        ) : (
          <>
            <NexusRecoveryHint message="Tournament details not available. Check the tournaments page." />
            {isValidHubHandoffHref(TOURNAMENTS_HREF) ? (
              <p className="text-[11px] text-gray-500">
                <NexusLinkWrapper
                  href={TOURNAMENTS_HREF}
                  isValid
                  title="Opens tournaments page"
                  className="font-medium text-red-300/80 underline-offset-2 hover:underline"
                >
                  Go to tournaments
                </NexusLinkWrapper>
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
