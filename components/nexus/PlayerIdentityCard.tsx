import { memo } from "react";
import Link from "next/link";
import VaultPreview from "@/components/nexus/VaultPreview";
import { assignPlayerIdentity, type TitleIdentity } from "@/lib/reputation/titleAssignment";

type Props = {
  label: string;
  flag?: string | null;
  rating?: number | null;
  tier?: string | null;
  earnings?: number | null;
  streak?: number | null;
  peakRating?: number | null;
  achievement?: string | null;
  icon?: string;
  emphasis?: "base" | "high" | "top";
  compact?: boolean;
  k12?: boolean;
  isSelf?: boolean;
  showVault?: boolean;
  allowVaultNav?: boolean;
  overallWinRate?: number | null;
  recentWinRate?: number | null;
  recentForm?: string | null;
  trendDelta?: number | null;
  strengthLabel?: string | null;
  momentumScore?: number | null;
  trajectory?: "Rising" | "Stable" | "Cooling" | null;
  breakoutFlag?: "Emerging" | "Watchlist" | null;
  /** Standings rank when known — primary title ladder signal */
  standingRank?: number | null;
  tournamentWins?: number;
  seasonalChampion?: boolean;
  /** When false, hides secondary reputation number (K–12 defaults to hidden). */
  showReputation?: boolean;
  /** Phase 21 — optional competitive-social hints (derived, no messaging). */
  rivalryBadge?: boolean;
  socialContextLine?: string | null;
  presenceHint?: "active" | "recent";
  /** Phase 22 — season title from recorded championship feed */
  championRole?: "current" | "defending" | "former" | null;
  narrativeTag?: string | null;
  /** Phase 23 — contextual label for major-event spotlight (derived, not persistent rank) */
  eventContextLabel?: string | null;
};

function trendMeta(delta: number | null) {
  if (typeof delta !== "number") return { arrow: "→", tone: "text-gray-300", label: "stable" };
  if (delta > 6) return { arrow: "↑", tone: "text-emerald-300", label: `+${delta} improving` };
  if (delta < -6) return { arrow: "↓", tone: "text-rose-300", label: `${delta} declining` };
  return { arrow: "→", tone: "text-gray-300", label: `${delta >= 0 ? "+" : ""}${delta} stable` };
}

function prestigeRingClass(identity: TitleIdentity, k12: boolean, emphasis: Props["emphasis"]) {
  if (emphasis === "top") return "";
  if (identity.titleLevel >= 6)
    return k12 ? "ring-1 ring-cyan-300/45" : "ring-1 ring-amber-400/40";
  if (identity.titleLevel >= 4)
    return k12 ? "ring-1 ring-cyan-300/25" : "ring-1 ring-amber-400/22";
  return "";
}

function PlayerIdentityCard({
  label,
  flag = "♞",
  rating = null,
  tier = null,
  earnings = null,
  streak = null,
  peakRating = null,
  achievement = null,
  icon = "♟",
  emphasis = "base",
  compact = false,
  k12 = false,
  isSelf = false,
  showVault = true,
  allowVaultNav = true,
  overallWinRate = null,
  recentWinRate = null,
  recentForm = null,
  trendDelta = null,
  strengthLabel = null,
  momentumScore = null,
  trajectory = null,
  breakoutFlag = null,
  standingRank = null,
  tournamentWins = 0,
  seasonalChampion = false,
  showReputation,
  rivalryBadge = false,
  socialContextLine = null,
  presenceHint,
  championRole = null,
  narrativeTag = null,
  eventContextLabel = null,
}: Props) {
  const showRep = showReputation ?? !k12;

  const identity = assignPlayerIdentity({
    k12,
    standingRank,
    rating,
    tier,
    streak,
    tournamentWins,
    seasonalChampion,
  });

  const borderClass =
    emphasis === "top"
      ? k12
        ? "border-cyan-400 shadow-[0_0_18px_rgba(56,189,248,0.2)]"
        : "border-red-500 shadow-[0_0_22px_rgba(220,38,38,0.22)]"
      : emphasis === "high"
        ? k12
          ? "border-cyan-500/70"
          : "border-red-500/70"
        : k12
          ? "border-[#2a4564]"
          : "border-[#2a3442]";

  const ringClass = prestigeRingClass(identity, k12, emphasis);

  const legacyVault = identity.legacyMarkers.slice(0, 2).map((m, i) => ({
    id: `legacy-${i}`,
    label: m,
    value: "✓",
  }));
  const vaultItems = [
    ...legacyVault,
    { id: "v1", label: "Streak Badge", value: `${streak ?? 0}W` },
    { id: "v2", label: "Tier Relic", value: tier ?? "C" },
    { id: "v3", label: "Payout Seal", value: `$${earnings ?? 0}` },
    { id: "v4", label: "Peak Crest", value: `${peakRating ?? rating ?? "—"}` },
  ].slice(0, 4);

  const card = (
    <div
      className={`rounded-xl border ${borderClass} ${ringClass} ${k12 ? "bg-[#0f1b2a]" : "bg-[#0f1420]"} ${compact ? "p-2" : "p-3"} transition`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2 min-w-0">
        <p className={`${compact ? "text-xs" : "text-sm"} text-white font-semibold truncate`}>
          {icon} {label}
        </p>
        <p className="text-[11px] text-gray-400 shrink-0">{flag}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
            k12 ? "border-cyan-500/50 text-cyan-100 bg-cyan-950/40" : "border-amber-500/40 text-amber-100 bg-amber-950/30"
          }`}
          title={identity.title}
        >
          {identity.shortBadge}
        </span>
        <span className="text-sm leading-none" aria-hidden>
          {identity.rankIcon}
        </span>
        <span className={`text-[11px] font-medium ${k12 ? "text-cyan-100/95" : "text-amber-100/90"}`}>{identity.title}</span>
      </div>
      {championRole ? (
        <p
          className={`text-[10px] font-medium mt-1 ${
            k12 ? "text-cyan-100/90" : "text-amber-100/85"
          }`}
        >
          {championRole === "current"
            ? k12
              ? "Season top performer"
              : "Current champion"
            : championRole === "defending"
              ? k12
                ? "Defending title"
                : "Defending champion"
              : k12
                ? "Past season leader"
                : "Former champion"}
        </p>
      ) : null}
      {eventContextLabel ? (
        <p className={`text-[10px] font-medium mt-0.5 ${k12 ? "text-cyan-200/90" : "text-amber-200/85"}`}>{eventContextLabel}</p>
      ) : null}
      {narrativeTag ? (
        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{narrativeTag}</p>
      ) : null}
      {presenceHint || rivalryBadge ? (
        <div className="flex flex-wrap gap-1.5 mt-1 items-center">
          {presenceHint ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800/85 text-gray-300">
              {presenceHint === "active" ? (k12 ? "In a match" : "Active") : "Recently active"}
            </span>
          ) : null}
          {rivalryBadge ? (
            <span
              className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${
                k12 ? "border-cyan-500/45 text-cyan-100" : "border-violet-400/45 text-violet-100"
              }`}
            >
              {k12 ? "Frequent opponent" : "Rival"}
            </span>
          ) : null}
        </div>
      ) : null}
      <p className={`text-[11px] mt-1 ${k12 ? "text-cyan-200" : "text-red-300"}`}>
        {typeof rating === "number" ? rating : "Unrated"} • {tier ?? "Unranked"}
      </p>
      {!compact && showRep ? (
        <p className="text-[10px] text-gray-500 mt-0.5">Rep {identity.reputationScore} · performance-derived</p>
      ) : null}
      {!compact ? (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] text-gray-300">
          <p>
            Earned: <span className="text-white">${earnings ?? 0}</span>
          </p>
          <p>
            Streak: <span className="text-white">{streak ?? 0}</span>
          </p>
          <p>
            Peak: <span className="text-white">{peakRating ?? rating ?? "—"}</span>
          </p>
          <p className="truncate">
            Badge: <span className="text-white">{tier ?? "C"}</span>
          </p>
        </div>
      ) : null}
      <div className="mt-1 text-[11px] text-gray-300">
        <p className={trendMeta(trendDelta).tone}>
          {trendMeta(trendDelta).arrow} {k12 ? trajectory ?? "Stable" : trendMeta(trendDelta).label}
        </p>
        {!k12 && (typeof overallWinRate === "number" || typeof recentWinRate === "number") ? (
          <p>
            WR {typeof overallWinRate === "number" ? `${overallWinRate}%` : "—"} • Recent{" "}
            {typeof recentWinRate === "number" ? `${recentWinRate}%` : "—"}
          </p>
        ) : null}
        {!k12 && recentForm ? <p>Form: {recentForm}</p> : null}
        {strengthLabel ? <p className="text-gray-200">{strengthLabel}</p> : null}
        {trajectory ? (
          <p
            className={
              trajectory === "Rising" ? "text-emerald-300" : trajectory === "Cooling" ? "text-rose-300" : "text-gray-300"
            }
          >
            Trajectory: {trajectory}
          </p>
        ) : null}
        {!k12 && typeof momentumScore === "number" ? <p>Momentum: {momentumScore}</p> : null}
        {breakoutFlag ? <p className={k12 ? "text-cyan-200" : "text-red-300"}>{breakoutFlag}</p> : null}
      </div>
      {identity.legacyMarkers.length > 0 ? (
        <p className="text-[10px] text-gray-400 mt-1.5 line-clamp-2">{identity.legacyMarkers.join(" · ")}</p>
      ) : null}
      {socialContextLine ? (
        <p className="text-[10px] text-gray-400 mt-1 line-clamp-3">{socialContextLine}</p>
      ) : null}
      {achievement ? <p className="text-[11px] text-gray-300 mt-1 truncate">{achievement}</p> : null}
      {showVault ? (
        <div className="mt-2">
          <VaultPreview
            compact={compact}
            k12={k12}
            allowNav={!k12 && allowVaultNav && isSelf}
            items={vaultItems}
          />
        </div>
      ) : null}
    </div>
  );

  if (isSelf && !k12 && allowVaultNav) {
    return (
      <Link href="/vault" className="block">
        {card}
      </Link>
    );
  }
  return card;
}

export default memo(PlayerIdentityCard);
