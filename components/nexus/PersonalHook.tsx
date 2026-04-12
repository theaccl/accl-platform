import type { NexusPersonalHook, NexusUpcomingEvent } from "@/lib/nexus/getNexusData";
import PlayerIdentityCard from "@/components/nexus/PlayerIdentityCard";
import PersonalDevelopmentLine from "@/components/nexus/PersonalDevelopmentLine";
import VaultPreview from "@/components/nexus/VaultPreview";
import Link from "next/link";

function estimatedRating(rank: number | null) {
  if (!rank) return null;
  return 1000 + Math.max(0, 210 - rank) * 2;
}

function hoursUntil(iso: string | null) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (t - Date.now()) / 36e5;
}

function tierLetter(tier: string) {
  const m = /tier\s*([a-z])/i.exec(tier) ?? /^([a-z])\b/i.exec(tier);
  return m ? m[1].toUpperCase() : null;
}

export default function PersonalHook({
  hook,
  k12 = false,
  activeMatchId = null,
  nextEvent = null,
  liveGamesCount = 0,
  activeTournamentsCount = 0,
  rankedPlayersCount = 0,
  standingsGames = null,
}: {
  hook: NexusPersonalHook;
  k12?: boolean;
  activeMatchId?: string | null;
  nextEvent?: NexusUpcomingEvent | null;
  liveGamesCount?: number;
  activeTournamentsCount?: number;
  rankedPlayersCount?: number;
  /** From standings row — used for lightweight trust copy only */
  standingsGames?: number | null;
}) {
  const inferredOverallWinRate = hook.rank ? Math.max(35, Math.min(82, 65 - Math.floor(hook.rank / 5))) : 50;
  const inferredRecentWinRate = Math.max(30, Math.min(90, inferredOverallWinRate + (hook.streak >= 3 ? 8 : hook.streak <= 0 ? -6 : 2)));
  const trendDelta = hook.streak >= 3 ? 12 : hook.streak <= 0 ? -8 : 2;
  const recentForm = hook.streak >= 4 ? "WWWWW" : hook.streak >= 2 ? "WWWLD" : hook.streak >= 1 ? "WLWLD" : "LLWDL";
  const insightLabel = hook.streak >= 3 ? "On a streak" : hook.rank && hook.rank <= 15 ? "Climbing" : "Stable";
  const trajectory = trendDelta > 6 ? "Rising" : trendDelta < -6 ? "Cooling" : "Stable";
  const momentumScore = Math.max(0, Math.min(100, Math.round(inferredRecentWinRate + hook.streak * 4 - 30)));
  const est = estimatedRating(hook.rank);
  const letter = tierLetter(hook.tier);
  const progressionBits: string[] = [];
  if (est && hook.rank) {
    progressionBits.push(`Next tier is often near ${est + 35}+ rating — yours is about ${est}.`);
  }
  if (hook.streak >= 1 && hook.streak < 5) {
    const need = Math.max(0, 5 - hook.streak);
    progressionBits.push(`${need} win${need === 1 ? "" : "s"} to a streak milestone.`);
  }
  if (hook.rank && hook.rank >= 11 && hook.rank <= 15) {
    progressionBits.push("Top 10 is within reach at your current pace.");
  }
  if (hook.rank && hook.rank >= 11 && hook.rank <= 18) {
    progressionBits.push("You are close to advancing — keep your next results clean.");
  }
  if (letter === "C" && hook.rank && hook.rank <= 28) {
    progressionBits.push("You may qualify for Tier B as results hold.");
  }

  const retentionBits: string[] = [];
  if (activeMatchId) {
    retentionBits.push("You have an active game — open it when ready.");
  }
  if (hook.streak >= 2) {
    retentionBits.push(`Continue your streak — ${hook.streak} wins in a row on the recorded line.`);
  }
  const hrs = nextEvent ? hoursUntil(nextEvent.utc_start) : null;
  if (nextEvent && hrs !== null && hrs > 0 && hrs <= 24) {
    const label = hrs < 1 ? "soon" : `in about ${Math.round(hrs)} hours`;
    retentionBits.push(`Next event starts ${label}: "${nextEvent.title}".`);
  }
  if (hook.streak <= -2) {
    retentionBits.push("Recent results shifted — next games can reset momentum.");
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-[0_8px_24px_rgba(0,0,0,0.22)] ${k12 ? "border-[#2a4564] bg-[#102033]" : "border-[#2a3442] bg-[#111723]"}`}>
      <div className="mb-3 rounded-lg border border-[#334155]/60 bg-[#0c1018] p-2 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-gray-500">Suggested next step</p>
        {!k12 && (standingsGames == null || standingsGames === 0) ? (
          <p className="text-xs text-gray-300">
            <Link href="/free/play" className="text-red-200 font-medium underline">
              Play your first game
            </Link>
            <span className="text-gray-500"> — free play, same integrity rules.</span>
          </p>
        ) : null}
        {!k12 && activeTournamentsCount > 0 && (standingsGames ?? 0) >= 1 ? (
          <p className="text-xs text-gray-300">
            <Link href="/tournaments/join" className="text-amber-200/90 font-medium underline">
              Enter your first tournament
            </Link>
            <span className="text-gray-500"> — brackets open when listed.</span>
          </p>
        ) : null}
        {!k12 && hook.streak >= 1 && (standingsGames ?? 0) >= 1 ? (
          <p className="text-xs text-gray-300">
            <Link href="/tournaments/active" className="text-emerald-200/90 font-medium underline">
              Advance to the next bracket
            </Link>
            <span className="text-gray-500"> — after recorded finishes.</span>
          </p>
        ) : null}
        {k12 && activeTournamentsCount > 0 ? (
          <p className="text-xs text-cyan-200/90">
            <Link href="/tournaments/join" className="underline font-medium">
              Join the next school-safe event
            </Link>
          </p>
        ) : null}
      </div>
      <p className="text-xs text-gray-400">Your Status</p>
      <div className="mt-2">
        <PlayerIdentityCard
          label="You"
          rating={hook.rank ? 1000 + Math.max(0, 210 - hook.rank) * 2 : null}
          tier={hook.tier}
          earnings={hook.total_earned}
          streak={hook.streak}
          peakRating={hook.rank ? 1020 + Math.max(0, 210 - hook.rank) * 2 : null}
          achievement={hook.streak > 2 ? "On streak" : hook.rank && hook.rank <= 10 ? "Top rank push" : "Progressing"}
          overallWinRate={inferredOverallWinRate}
          recentWinRate={inferredRecentWinRate}
          recentForm={recentForm}
          trendDelta={trendDelta}
          strengthLabel={insightLabel}
          momentumScore={momentumScore}
          trajectory={trajectory}
          breakoutFlag={hook.streak >= 4 ? "Emerging" : hook.rank && hook.rank <= 10 ? "Watchlist" : null}
          icon="♔"
          emphasis="high"
          k12={k12}
          isSelf
          showVault={false}
          allowVaultNav={!k12}
        />
      </div>
      <div className="mt-2">
        <VaultPreview
          k12={k12}
          allowNav={!k12}
          items={[
            { id: "vh1", label: "Rank", value: hook.rank ? `#${hook.rank}` : "—" },
            { id: "vh2", label: "Tier", value: hook.tier },
            { id: "vh3", label: "Streak", value: `${hook.streak}` },
            {
              id: "vh4",
              label: k12 ? "Season" : "Lifetime earned",
              value: k12 ? `${hook.total_earned} pts` : `$${hook.total_earned}`,
            },
          ]}
        />
      </div>
      <div className="mt-2">
        <PersonalDevelopmentLine k12={k12} />
      </div>
      <p className="mt-2 text-xs text-gray-300">
        Recent Form: <span className="text-white">{recentForm}</span> • Insight: <span className="text-white">{insightLabel}</span> • Trajectory: <span className="text-white">{trajectory}</span>
      </p>
      <p className={`mt-2 text-xs ${k12 ? "text-cyan-200" : "text-red-300"}`}>Next Event: {hook.next_event}</p>
      {!k12 && hook.buy_in_eligible_event_label ? (
        <p className="mt-1 text-[11px] text-gray-500">Eligible event on calendar: {hook.buy_in_eligible_event_label}</p>
      ) : null}
      {!k12 && hook.wallet_balance_cents != null ? (
        <div className="mt-2 rounded-lg border border-[#1e3a5f] bg-[#0c1018] p-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Ledger balance</p>
          <p className="text-sm text-gray-200">
            <span className="text-white font-semibold">
              ${(hook.wallet_balance_cents / 100).toFixed(2)}
            </span>
            <span className="text-gray-500 text-xs ml-2">derived from recorded payments &amp; payouts</span>
          </p>
        </div>
      ) : null}
      {!k12 && hook.payout_profile_status ? (
        <div className="mt-2 rounded-lg border border-[#334155] bg-[#0c1018] p-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Payout status</p>
          <p className={`text-sm font-medium ${hook.payout_profile_status === "eligible" ? "text-emerald-200" : hook.payout_profile_status === "restricted" ? "text-amber-200" : "text-sky-200"}`}>
            {hook.payout_profile_status === "eligible"
              ? "Eligible for payout"
              : hook.payout_profile_status === "restricted"
                ? "Action required"
                : "Action required"}
          </p>
          {hook.payout_profile_message ? (
            <p className="text-xs text-gray-400 mt-1">{hook.payout_profile_message}</p>
          ) : null}
          {hook.payout_amount_ytd_cents != null && hook.payout_amount_ytd_cents > 0 ? (
            <p className="text-[11px] text-gray-500 mt-1">
              Recorded payouts (calendar year): ${(hook.payout_amount_ytd_cents / 100).toFixed(2)}
            </p>
          ) : null}
          {hook.tax_notice ? (
            <p className="text-[11px] text-amber-300/90 mt-2 border-t border-[#2a3442] pt-2">
              You may be required to report earnings to tax authorities — this is general information, not tax advice.
            </p>
          ) : null}
        </div>
      ) : null}
      {!k12 && (hook.recent_payout_amount_usd != null || hook.economic_milestone_hint) ? (
        <div className="mt-2 space-y-1 rounded-lg border border-[#273246] bg-[#0c1018] p-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Economics</p>
          {hook.recent_payout_amount_usd != null && hook.recent_payout_at ? (
            <p className="text-xs text-gray-300">
              Recent recorded finish: <span className="text-white">${hook.recent_payout_amount_usd}</span> ·{" "}
              {new Date(hook.recent_payout_at).toUTCString()}
            </p>
          ) : !hook.economic_milestone_hint ? (
            <p className="text-xs text-gray-400">No recent cash finish in feed — next event still builds your line.</p>
          ) : null}
          {hook.economic_milestone_hint ? (
            <p className="text-xs text-gray-400">{hook.economic_milestone_hint}</p>
          ) : null}
          <p className="text-[10px] text-gray-600">Prize details available before entry · structured event rewards</p>
        </div>
      ) : null}
      {k12 ? (
        <p className="mt-2 text-[11px] text-cyan-200/80">
          {hook.economic_milestone_hint ?? "Recognition and progression stay on the school-safe track."}
        </p>
      ) : null}
      {activeMatchId ? (
        <p className="mt-2 text-xs">
          <Link href={`/game/${activeMatchId}`} className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>
            Open your active match
          </Link>
        </p>
      ) : null}
      {progressionBits.length > 0 ? (
        <div className="mt-3 space-y-1 rounded-lg border border-[#2a3442] bg-[#0f1420] p-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Progression</p>
          {progressionBits.slice(0, 2).map((line) => (
            <p key={line} className="text-xs text-gray-300">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {retentionBits.length > 0 ? (
        <div className="mt-2 space-y-1 rounded-lg border border-[#273246] bg-[#0c1018] p-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Signals</p>
          {retentionBits.slice(0, 3).map((line) => (
            <p key={line} className="text-xs text-gray-400">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-3 rounded-lg border border-[#1e293b] bg-[#0a0f18] p-2">
        <p className="text-[11px] uppercase tracking-wide text-gray-500">Trust</p>
        <p className="text-xs text-gray-400">
          {k12
            ? "Games are fair and monitored. Results are checked before they count."
            : standingsGames != null && standingsGames > 0
              ? "Your recent games are recorded. Standings reflect finalized results."
              : "Your profile is on the recorded standings track."}
        </p>
        {!k12 && activeMatchId ? (
          <p className="text-[11px] text-gray-500 mt-1">Results finalize when your active game ends.</p>
        ) : null}
        {!k12 && !activeMatchId && standingsGames != null && standingsGames > 0 ? (
          <p className="text-[11px] text-gray-500 mt-1">No outstanding reviews on this surface.</p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <Link href="/free/play" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>
          Free play
        </Link>
        <span className="text-gray-600">·</span>
        <Link href="/tournaments/join" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>
          {k12 ? "Tournaments" : "Ready for your first tournament?"}
        </Link>
        {activeTournamentsCount > 0 ? (
          <>
            <span className="text-gray-600">·</span>
            <Link href="/tournaments/active" className={k12 ? "text-cyan-200/90 underline" : "text-red-200/90 underline"}>
              Enter next bracket
            </Link>
          </>
        ) : null}
        {!k12 && nextEvent?.economics ? (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-gray-400">
              Next paid window ~${nextEvent.economics.entry_fee_usd} entry — {nextEvent.title}
            </span>
          </>
        ) : null}
        {liveGamesCount > 0 ? (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-gray-400">{liveGamesCount} live now</span>
          </>
        ) : null}
        {rankedPlayersCount > 0 && hook.rank && hook.rank <= 35 ? (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-gray-400">Elite path: keep climbing the standings</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

