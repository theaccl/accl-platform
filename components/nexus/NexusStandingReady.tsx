"use client";

import NexusExpandableRow from "@/components/nexus/NexusExpandableRow";
import NexusRecoveryHint from "@/components/nexus/NexusRecoveryHint";
import NexusTrustHint, { STANDING_EXPANDED_TRUST_MESSAGE } from "@/components/nexus/NexusTrustHint";
import { nexusModuleHeadingClass, nexusTransition } from "@/components/nexus/NexusHeader";

export type NexusStandingReadyProps = {
  message: string;
  hint?: string;
  emphasis?: "strong" | "neutral";
  rank: number;
  tier: string;
  streak: number;
  rating: number;
  earned: number;
  gamesPlayed: number;
};

function streakSentence(streak: number): string {
  if (streak <= 0) return "No active win streak in the visible standings snapshot.";
  if (streak === 1) return "Current streak: 1 recorded win.";
  return `Current streak: ${streak} wins in a row.`;
}

export default function NexusStandingReady(state: NexusStandingReadyProps) {
  return (
    <section
      className={`rounded-2xl border border-[#2a3442] bg-[#111723] p-4 shadow-md shadow-black/15 ${nexusTransition} hover:shadow-lg hover:shadow-black/20`}
      aria-label="Standing context"
    >
      <h2 className={nexusModuleHeadingClass}>Your standing</h2>
      <p className="mb-3 text-[11px] leading-snug text-gray-500">Based on current recorded games.</p>
      <div className="space-y-4">
        <div className="space-y-1.5 border-b border-[#243244]/50 pb-3">
          <p
            className={
              state.emphasis === "strong"
                ? "text-[17px] font-semibold leading-snug tracking-tight text-gray-50"
                : "text-sm font-medium leading-snug text-gray-100"
            }
          >
            {state.message}
          </p>
          {state.hint ? <p className="text-[12px] leading-relaxed text-gray-500">{state.hint}</p> : null}
          {!state.hint && state.gamesPlayed < 5 ? (
            <NexusRecoveryHint message="Complete more games to improve your position." />
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">Rank</dt>
            <dd className="font-semibold text-gray-100">#{state.rank}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">Tier</dt>
            <dd className="text-gray-200">{state.tier}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">Rating</dt>
            <dd className="tabular-nums text-gray-200">{state.rating}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">Streak</dt>
            <dd className="tabular-nums text-gray-200">{state.streak}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">Games played</dt>
            <dd className="tabular-nums text-gray-200">{state.gamesPlayed}</dd>
          </div>
          <div className="opacity-90">
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">Earned (derived)</dt>
            <dd className="tabular-nums text-gray-400">{state.earned}</dd>
          </div>
        </dl>

        <NexusExpandableRow
          isExpandable
          detailsMaxHeightClass="max-h-72"
          className="rounded-lg border border-[#243244]/70 bg-[#0c1018]/80"
          summaryClassName="px-3 py-2.5"
          summary={<span className="text-[12px] font-medium text-gray-400">Standing details and context</span>}
          details={
            <>
              <NexusTrustHint message={STANDING_EXPANDED_TRUST_MESSAGE} />
              <p className="mt-1.5 text-gray-400">{streakSentence(state.streak)}</p>
              <p className="text-gray-500">
                Earned (derived) aggregates recorded results; it is not a payout or balance.
              </p>
            </>
          }
        />
      </div>
    </section>
  );
}
