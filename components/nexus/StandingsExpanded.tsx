"use client";

import { memo, useMemo, useRef, useState } from "react";
import type { NexusSocialLayer, NexusStanding } from "@/lib/nexus/getNexusData";
import PlayerIdentityCard from "@/components/nexus/PlayerIdentityCard";
import { useOpenPublicIdentityCard } from "@/components/identity/PublicIdentityCardContext";
import Link from "next/link";
import { assignPlayerIdentity } from "@/lib/reputation/titleAssignment";
import { socialLineForPair } from "@/lib/social/buildNexusSocialLayer";
import { pairKey } from "@/lib/social/rivalryDetection";

function trendFromStanding(wins: number, games: number, streak: number) {
  const wr = games > 0 ? Math.round((wins / games) * 100) : 0;
  return Math.max(-25, Math.min(25, Math.round((wr - 50) / 2) + streak));
}

function strengthLabel(wins: number, streak: number) {
  if (streak >= 5) return "Streak Player";
  if (wins >= 25) return "Strong Finisher";
  if (wins >= 10) return "Consistent";
  return "Developing";
}

function momentumScore(wins: number, games: number, streak: number) {
  const wr = games > 0 ? (wins / games) * 100 : 50;
  return Math.max(0, Math.min(100, Math.round(wr + streak * 3 - 35)));
}

function trajectoryFromTrend(delta: number): "Rising" | "Stable" | "Cooling" {
  if (delta > 6) return "Rising";
  if (delta < -6) return "Cooling";
  return "Stable";
}

function StandingsExpanded({
  rows,
  currentUserId,
  k12 = false,
  economyFunnelHint,
  social,
}: {
  rows: NexusStanding[];
  currentUserId: string | null;
  k12?: boolean;
  economyFunnelHint?: string;
  social?: NexusSocialLayer;
}) {
  const openIdentity = useOpenPublicIdentityCard();
  const [showSelfPinned, setShowSelfPinned] = useState(false);
  const [jumpFlash, setJumpFlash] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const meRef = useRef<HTMLDivElement | null>(null);
  const me = useMemo(() => rows.find((r) => r.user_id === currentUserId) ?? null, [rows, currentUserId]);
  const leader = rows[0] ?? null;

  const pin = showSelfPinned && me ? me : leader;
  const jumpToMe = () => {
    if (!meRef.current || !scrollRef.current) return;
    meRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    setShowSelfPinned(true);
    setJumpFlash(true);
    window.setTimeout(() => setJumpFlash(false), 1400);
  };

  const onStandingsScroll = () => {
    if (!meRef.current || !scrollRef.current || !me) return;
    const containerTop = scrollRef.current.getBoundingClientRect().top;
    const meTop = meRef.current.getBoundingClientRect().top;
    // when own row scrolls above the visible body, pin swaps to "You"
    setShowSelfPinned(meTop <= containerTop + 4);
  };

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 shadow-[0_10px_28px_rgba(0,0,0,0.25)] overflow-x-hidden ${k12 ? "border-[#2a4564] bg-[#102033]" : "border-[#2a3442] bg-[#111723]"}`}>
      <div className={`sticky top-0 z-10 rounded-xl border px-3 py-2 mb-3 ${k12 ? "border-cyan-600 bg-[#10293d]" : "border-red-700 bg-[#1b1217]"}`}>
        <p className="text-xs text-gray-300">{showSelfPinned && me ? "Pinned: You" : "Pinned: #1"}</p>
        {pin ? (
          <PlayerIdentityCard
            label={`#${pin.rank} ${pin.username}`}
            rating={pin.rating}
            tier={pin.tier}
            earnings={pin.earned}
            streak={pin.streak}
            standingRank={pin.rank}
            peakRating={pin.rating}
            achievement={`${pin.wins}W • ${pin.games}G`}
            overallWinRate={pin.games > 0 ? Math.round((pin.wins / pin.games) * 100) : null}
            recentWinRate={pin.games > 0 ? Math.round((pin.wins / pin.games) * 100) : null}
            recentForm={pin.streak >= 3 ? "WWWWL" : pin.streak >= 1 ? "WLWLD" : "LLWDL"}
            trendDelta={trendFromStanding(pin.wins, pin.games, pin.streak)}
            strengthLabel={strengthLabel(pin.wins, pin.streak)}
            momentumScore={momentumScore(pin.wins, pin.games, pin.streak)}
            trajectory={trajectoryFromTrend(trendFromStanding(pin.wins, pin.games, pin.streak))}
            breakoutFlag={pin.streak >= 4 ? "Emerging" : pin.wins >= 18 ? "Watchlist" : null}
            compact
            k12={k12}
            isSelf={Boolean(me && pin.user_id === me.user_id)}
            allowVaultNav={false}
            showVault={false}
            emphasis={showSelfPinned ? "high" : "top"}
            rivalryBadge={Boolean(
              currentUserId &&
                pin.user_id !== currentUserId &&
                social?.rival_adjacency[currentUserId]?.includes(pin.user_id),
            )}
            presenceHint={social?.presence[pin.user_id]}
            socialContextLine={
              currentUserId && pin.user_id !== currentUserId
                ? socialLineForPair(
                    currentUserId,
                    pin.user_id,
                    k12,
                    social?.head_to_head[pairKey(currentUserId, pin.user_id)],
                  )
                : null
            }
            onHeadlineClick={openIdentity ? () => openIdentity(pin.user_id) : undefined}
          />
        ) : (
          <p className="text-sm text-white font-semibold">No standings yet</p>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed break-words">
        <Link href="/free/play" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>
          Free play
        </Link>
        <span className="text-gray-600"> → </span>
        <Link href="/tournaments/join" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>
          Tournament
        </Link>
        <span className="text-gray-600"> → </span>
        <span className="text-gray-400">Tier progression → elite events</span>
        {me && me.rank >= 12 && me.rank <= 22 ? (
          <span className="text-gray-400"> — you may qualify for the next tier soon.</span>
        ) : null}
        {economyFunnelHint ? <span className="block mt-1 text-gray-500">{economyFunnelHint}</span> : null}
      </p>
      {me ? (
        <div className={`mb-3 rounded-xl border p-2 ${k12 ? "border-[#2a4564] bg-[#0f1b2a]" : "border-[#2a3442] bg-[#0f1420]"}`}>
          <p className="text-xs text-gray-400 mb-1">You</p>
          <div
            role="button"
            tabIndex={0}
            onClick={jumpToMe}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                jumpToMe();
              }
            }}
            className="w-full min-h-[48px] text-left text-sm text-white rounded-lg touch-manipulation active:opacity-90 py-1 -my-1 cursor-pointer"
          >
            <PlayerIdentityCard
              label={`#${me.rank} ${me.username}`}
              rating={me.rating}
              tier={me.tier}
              earnings={me.earned}
              streak={me.streak}
              standingRank={me.rank}
              peakRating={me.rating}
              achievement={`${me.wins}W • ${me.games}G`}
              overallWinRate={me.games > 0 ? Math.round((me.wins / me.games) * 100) : null}
              recentWinRate={me.games > 0 ? Math.round((me.wins / me.games) * 100) : null}
              recentForm={me.streak >= 3 ? "WWWWL" : me.streak >= 1 ? "WLWLD" : "LLWDL"}
              trendDelta={trendFromStanding(me.wins, me.games, me.streak)}
              strengthLabel={strengthLabel(me.wins, me.streak)}
              momentumScore={momentumScore(me.wins, me.games, me.streak)}
              trajectory={trajectoryFromTrend(trendFromStanding(me.wins, me.games, me.streak))}
              breakoutFlag={me.streak >= 4 ? "Emerging" : me.wins >= 18 ? "Watchlist" : null}
              compact
              k12={k12}
              isSelf
              allowVaultNav={false}
              showVault={false}
              emphasis="high"
              presenceHint={social?.presence[me.user_id]}
              onHeadlineClick={openIdentity ? () => openIdentity(me.user_id) : undefined}
            />
          </div>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={onStandingsScroll}
        className="max-h-96 overflow-y-auto overflow-x-hidden touch-pan-y space-y-3 sm:space-y-2 pr-1 -mr-1"
      >
        {rows.map((r) => {
          const rowIdentity = assignPlayerIdentity({
            k12,
            standingRank: r.rank,
            rating: r.rating,
            tier: r.tier,
            streak: r.streak,
          });
          const topBand = r.rank <= 3;
          const overlapWithMe = Boolean(
            currentUserId &&
              r.user_id !== currentUserId &&
              social?.rival_adjacency[currentUserId]?.includes(r.user_id),
          );
          return (
          <div
            key={r.user_id}
            ref={me?.user_id === r.user_id ? meRef : null}
            className={`rounded-lg border px-3 py-3 sm:py-2 ${
              me?.user_id === r.user_id
                ? jumpFlash
                  ? k12
                    ? "border-cyan-400 bg-[#123448] shadow-[0_0_18px_rgba(56,189,248,0.28)]"
                    : "border-red-400 bg-[#311520] shadow-[0_0_20px_rgba(220,38,38,0.35)]"
                  : k12
                    ? "border-cyan-500 bg-[#123042]"
                    : "border-red-500 bg-[#22121a]"
                : k12
                  ? "border-[#2a4564] bg-[#0f1b2a]"
                  : "border-[#2a3442] bg-[#0f1420]"
            } ${topBand ? (k12 ? "ring-1 ring-cyan-300/25" : "ring-1 ring-amber-400/22") : ""}`}
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2 min-w-0">
              <p className="text-sm text-white min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                {openIdentity ? (
                  <button
                    type="button"
                    data-testid={`nexus-standing-name-${r.user_id}`}
                    onClick={() => openIdentity(r.user_id)}
                    className="truncate max-w-full border-0 bg-transparent p-0 text-left text-inherit underline decoration-dotted decoration-white/30 underline-offset-2 hover:decoration-solid"
                  >
                    #{r.rank} {r.username}
                  </button>
                ) : (
                  <span className="truncate">
                    #{r.rank} {r.username}
                  </span>
                )}
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${
                    k12 ? "border-cyan-500/45 text-cyan-100 bg-cyan-950/35" : "border-amber-500/40 text-amber-100 bg-amber-950/25"
                  }`}
                  title={rowIdentity.title}
                >
                  {rowIdentity.rankIcon} {rowIdentity.shortBadge} · {rowIdentity.title}
                </span>
                {overlapWithMe ? (
                  <span className="text-[10px] text-gray-500 shrink-0">{k12 ? "Overlap" : "Rival history"}</span>
                ) : null}
              </p>
              <p className={`text-xs shrink-0 ${k12 ? "text-cyan-200" : "text-red-300"}`}>
                {r.tier} · {r.rating}{" "}
                {trendFromStanding(r.wins, r.games, r.streak) > 2
                  ? "↑"
                  : trendFromStanding(r.wins, r.games, r.streak) < -2
                    ? "↓"
                    : "→"}
                {momentumScore(r.wins, r.games, r.streak) >= 70 ? " · ✦" : ""}
              </p>
            </div>
            <p className="text-xs text-gray-400 line-clamp-2 sm:line-clamp-none">
              <span className="sm:hidden">
                {r.wins}W · {r.games}G · s{r.streak}
              </span>
              <span className="hidden sm:inline">
                {r.wins} wins • {r.games} games • streak {r.streak}
                {rows[r.rank - 2]
                  ? ` • ${rows[r.rank - 2].rating - r.rating >= 0 ? `-${rows[r.rank - 2].rating - r.rating}` : `+${Math.abs(rows[r.rank - 2].rating - r.rating)}`} vs above`
                  : ""}
              </span>
            </p>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(StandingsExpanded);
