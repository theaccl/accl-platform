import { nexusModuleHeadingClass, nexusTransition } from "@/components/nexus/NexusHeader";
import type { NexusIdentitySummaryData } from "@/lib/nexus/types";

const statLabel = "text-[10px] font-medium uppercase tracking-wide text-gray-500";
const statVal = "text-sm text-gray-200";

function cell(k: string, v: string, emptyHint?: boolean) {
  const showHint = emptyHint && (v === "—" || v === "");
  return (
    <div>
      <p className={statLabel}>{k}</p>
      <p className={showHint ? "text-sm text-gray-500" : statVal}>
        {showHint ? <span className="text-gray-500">Not available</span> : v}
      </p>
    </div>
  );
}

export default function NexusIdentitySummary({
  data,
  variant = "full",
}: {
  data: NexusIdentitySummaryData;
  /** Avoid duplicate rating lines when P1 snapshot card is shown nearby (P3). */
  variant?: "full" | "nameOnly";
}) {
  return (
    <section
      className={`flex h-full min-h-0 flex-col rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] p-4 shadow-lg shadow-black/25 ring-1 ring-inset ring-white/[0.04] ${nexusTransition} hover:shadow-xl hover:shadow-black/30 hover:ring-white/[0.07]`}
      aria-label="Identity summary"
    >
      <h2 className={`${nexusModuleHeadingClass} mb-0`}>Identity</h2>
      {data.isAnonymous ? (
        <div className="mt-3 flex flex-1 flex-col justify-center rounded-lg border border-dashed border-[#2a3442]/70 bg-[#0a0e14]/50 px-4 py-8 text-center">
          <p className="text-sm leading-relaxed text-gray-400">Sign in to load identity from your account.</p>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col gap-3">
          {variant === "nameOnly" ? (
            <p className="text-left text-lg font-semibold tracking-tight text-white">{data.displayName}</p>
          ) : (
            <>
              <div className="border-b border-[#243244]/50 pb-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Display name</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-white">{data.displayName}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
                {cell("ACCL rating", data.elo, true)}
                {cell("Rank", data.rank, true)}
                {cell("Games", data.gamesPlayed, true)}
                {cell("Wins", data.wins, true)}
                {cell("Streak", data.streak, true)}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
