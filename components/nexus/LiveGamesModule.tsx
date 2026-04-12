"use client";

import { memo, useMemo } from "react";
import type { NexusLiveGame } from "@/lib/nexus/getNexusData";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import GameCardView from "@/components/nexus/GameCardView";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { useNarrowViewport } from "@/hooks/useNarrowViewport";

function ratingOrTier(g: NexusLiveGame, side: "white" | "black") {
  const rating = side === "white" ? g.white_rating : g.black_rating;
  const tier = side === "white" ? g.white_tier : g.black_tier;
  if (typeof rating === "number") return String(rating);
  if (tier) return tier;
  return "Unrated";
}

function gamePriority(g: NexusLiveGame) {
  const ratingSum = (g.white_rating ?? 0) + (g.black_rating ?? 0);
  const tournamentBoost = g.tournament_id ? 900 : 0;
  const chBoost = g.is_championship_match ? 2000 : 0;
  const globalBoost = g.global_event_mega ? 1200 : g.global_event_id ? 400 : 0;
  const finalBoost =
    /final|semi/i.test(String(g.tournament_name ?? "")) || /final/i.test(String(g.tournament_status ?? "")) ? 400 : 0;
  return ratingSum + tournamentBoost + chBoost + finalBoost + globalBoost;
}

function featuredGames(games: NexusLiveGame[]) {
  return [...games].sort((a, b) => gamePriority(b) - gamePriority(a)).slice(0, 2);
}

function stageOf(game: NexusLiveGame): "Finals" | "Semifinals" | "Quarterfinals" | "Featured" | "Live" {
  const text = `${String(game.tournament_name ?? "")} ${String(game.tournament_status ?? "")}`.toLowerCase();
  if (text.includes("final")) return "Finals";
  if (text.includes("semi")) return "Semifinals";
  if (text.includes("quarter")) return "Quarterfinals";
  if (game.tournament_id) return "Featured";
  return "Live";
}

const COLLAPSED_LIST_CAP_DESKTOP = 6;
const COLLAPSED_LIST_CAP_MOBILE = 4;
const COLLAPSED_FEATURED_CAP_DESKTOP = 2;
const COLLAPSED_FEATURED_CAP_MOBILE = 1;

function LiveGamesModule({
  games,
  activeTournamentCount = 0,
  k12 = false,
}: {
  games: NexusLiveGame[];
  activeTournamentCount?: number;
  k12?: boolean;
}) {
  const narrow = useNarrowViewport();
  const listCap = narrow ? COLLAPSED_LIST_CAP_MOBILE : COLLAPSED_LIST_CAP_DESKTOP;
  const featCap = narrow ? COLLAPSED_FEATURED_CAP_MOBILE : COLLAPSED_FEATURED_CAP_DESKTOP;
  const liveElseExpandedCap = narrow ? 8 : 12;

  const { featured, regular, finals, semis, quarters, liveElse, globalBoards } = useMemo(() => {
    const featured = featuredGames(games);
    const featuredIds = new Set(featured.map((g) => g.id));
    const globalBoards = games.filter((g) => g.global_event_id);
    const regular = games.filter((g) => !featuredIds.has(g.id));
    const finals = regular.filter((g) => stageOf(g) === "Finals");
    const semis = regular.filter((g) => stageOf(g) === "Semifinals");
    const quarters = regular.filter((g) => stageOf(g) === "Quarterfinals");
    const liveElse = regular.filter((g) => !["Finals", "Semifinals", "Quarterfinals"].includes(stageOf(g)));
    return { featured, regular, finals, semis, quarters, liveElse, globalBoards };
  }, [games]);

  const collapsedFeatured = featured.slice(0, featCap);
  const collapsedRegular = regular.slice(0, listCap);

  const spectateHref = (id: string) => (k12 ? `/game/${id}?spectate=1&eco=k12` : `/game/${id}?spectate=1`);

  const collapsed = (
    <div className="space-y-3 sm:space-y-2 max-h-56 overflow-y-auto overflow-x-hidden touch-pan-y pr-1 -mr-1">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        <Link href="/free/play" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>
          Free play
        </Link>
        <span className="text-gray-600"> · </span>
        <Link href="/tournaments/join" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>
          Tournament entry
        </Link>
        {activeTournamentCount > 0 ? (
          <>
            <span className="text-gray-600"> · </span>
            <Link href="/tournaments/active" className={k12 ? "text-cyan-200/90 underline" : "text-red-200/90 underline"}>
              Next bracket
            </Link>
          </>
        ) : null}
        <span className="text-gray-500"> — watch live play, then step in when you are ready.</span>
      </p>
      <p className="text-[10px] text-gray-500">
        Live matches · {k12 ? "Fair play monitoring" : "Under active monitoring"}
      </p>
      {featured.length > 0 ? (
        <div className={`rounded-lg border p-2 ${k12 ? "border-cyan-500/30 bg-[#0f2235]" : "border-red-500/30 bg-[#21141c]"}`}>
          <p className="text-xs text-gray-200 mb-1">Featured Matches</p>
          <div className="space-y-1">
            {collapsedFeatured.map((g) => (
              <Link key={`f-${g.id}`} href={spectateHref(g.id)} className={`text-xs block ${k12 ? "text-cyan-200" : "text-red-200"}`}>
                <span className="block">
                  {g.white_label} vs {g.black_label} • {g.time_control}
                </span>
                <span className="text-[10px] text-gray-500 flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                  {g.global_event_chip ? (
                    <span className={k12 ? "text-cyan-200/90" : "text-amber-200/85"}>{g.global_event_chip}</span>
                  ) : null}
                  {g.rivalry_match ? (
                    <span className={k12 ? "text-cyan-200/75" : "text-violet-300/80"}>{k12 ? "Overlap" : "Rival"}</span>
                  ) : null}
                  {g.trending_match ? <span className="text-amber-200/85">Trending</span> : null}
                  {typeof g.approx_spectators === "number" ? <span>~{g.approx_spectators} watching</span> : null}
                </span>
              </Link>
            ))}
          </div>
          {featured.length > featCap ? (
            <p className="text-[10px] text-gray-500 mt-1">+{featured.length - featCap} more in expanded view</p>
          ) : null}
        </div>
      ) : null}
      {games.length === 0 ? (
        <div className="rounded-lg border border-[#2a3442] bg-[#0f1420] p-3">
          <p className="text-sm text-gray-300">No live games right now</p>
          <p className="text-xs text-gray-500">Check back soon or view upcoming events.</p>
        </div>
      ) : null}
      {collapsedRegular.map((g) => (
        <Link
          key={g.id}
          href={spectateHref(g.id)}
          prefetch
          className={`block rounded-lg border p-3 sm:p-2 text-sm text-gray-200 transition touch-manipulation active:opacity-95 min-h-[56px] ${
            k12 ? "border-[#2a4564] bg-[#0f1b2a] hover:border-cyan-500" : "border-[#2a3442] bg-[#0f1420] hover:border-red-500"
          }`}
        >
          <div className="flex items-start gap-3 sm:gap-2">
            <div className="shrink-0 rounded-md overflow-hidden border border-black/30" style={{ width: narrow ? 64 : 58 }}>
              <Chessboard options={{ id: `mini-${g.id}`, position: g.fen || "start" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{g.white_label} vs {g.black_label}</p>
              <p className="text-xs text-gray-400">
                {ratingOrTier(g, "white")} vs {ratingOrTier(g, "black")} • {g.time_control}
              </p>
              <p className={`text-xs ${k12 ? "text-cyan-200" : "text-red-300"} flex items-center gap-1`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${k12 ? "bg-cyan-300" : "bg-red-400"}`} />
                LIVE
              </p>
              <p className="text-[10px] text-gray-500 flex flex-wrap gap-x-2 gap-y-0.5">
                {g.global_event_chip ? (
                  <span className={k12 ? "text-cyan-200/90" : "text-amber-200/85"}>{g.global_event_chip}</span>
                ) : null}
                {g.rivalry_match ? (
                  <span className={k12 ? "text-cyan-200/75" : "text-violet-300/80"}>{k12 ? "Overlap" : "Rival"}</span>
                ) : null}
                {g.trending_match ? <span className="text-amber-200/85">Trending</span> : null}
                {typeof g.approx_spectators === "number" ? <span>~{g.approx_spectators} watching</span> : null}
                {g.narrative_tags?.length ? (
                  <span className="text-gray-400">{g.narrative_tags.slice(0, 2).join(" · ")}</span>
                ) : null}
              </p>
            </div>
          </div>
        </Link>
      ))}
      {regular.length > listCap ? (
        <p className="text-[10px] text-gray-500">Showing {listCap} of {regular.length} — expand for full list</p>
      ) : null}
    </div>
  );
  const expanded = (
    games.length === 0 ? (
      <div className="rounded-lg border border-[#2a3442] bg-[#0f1420] p-3">
        <p className="text-sm text-gray-300">No live games right now</p>
        <p className="text-xs text-gray-500">Check back soon or view upcoming events.</p>
      </div>
    ) : (
      <div className="space-y-3">
        <p className="text-[11px] text-gray-500">
          Path: <Link href="/free/play" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>free play</Link>
          {" → "}
          <Link href="/tournaments/join" className={k12 ? "text-cyan-200 underline" : "text-red-200 underline"}>tournament</Link>
          {" → "}
          <span className="text-gray-400">advancement & elite play</span>
        </p>
        <p className="text-[10px] text-gray-500">
          Live matches · {k12 ? "Fair play monitoring" : "Under active monitoring"}
        </p>
        {featured.length > 0 ? (
          <div className={`rounded-xl border p-3 ${k12 ? "border-cyan-500/30 bg-[#0f2235]" : "border-red-500/30 bg-[#21141c]"}`}>
            {globalBoards.length > 0 ? (
              <p className={`text-[11px] font-medium mb-2 ${k12 ? "text-cyan-200/90" : "text-amber-200/85"}`}>
                {k12 ? "Season showcase & featured boards" : "Major event & featured boards"}
              </p>
            ) : null}
            <p className="text-sm text-white font-semibold mb-2">Featured Matches</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-3">
              {featured.map((g) => (
                <GameCardView key={`fg-${g.id}`} game={g} k12={k12} featured />
              ))}
            </div>
          </div>
        ) : null}
        {finals.length > 0 ? (
          <div>
            <p className="text-xs text-gray-400 mb-2">Finals</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-3">
              {finals.slice(0, 6).map((g) => (
                <GameCardView key={`f-${g.id}`} game={g} k12={k12} />
              ))}
            </div>
          </div>
        ) : null}
        {semis.length > 0 ? (
          <div>
            <p className="text-xs text-gray-400 mb-2">Semifinals</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-3">
              {semis.slice(0, 6).map((g) => (
                <GameCardView key={`s-${g.id}`} game={g} k12={k12} />
              ))}
            </div>
          </div>
        ) : null}
        {quarters.length > 0 ? (
          <div>
            <p className="text-xs text-gray-400 mb-2">Quarterfinals</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-3">
              {quarters.slice(0, 6).map((g) => (
                <GameCardView key={`q-${g.id}`} game={g} k12={k12} />
              ))}
            </div>
          </div>
        ) : null}
        {liveElse.length > 0 ? (
          <div>
            <p className="text-xs text-gray-400 mb-2">Live Matches</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-3">
              {liveElse.slice(0, liveElseExpandedCap).map((g) => (
                <GameCardView key={`l-${g.id}`} game={g} k12={k12} />
              ))}
            </div>
          </div>
        ) : null}
        {liveElse.length > liveElseExpandedCap ? (
          <p className="text-xs text-gray-400">
            Showing {liveElseExpandedCap} of {liveElse.length} live matches in this section.
          </p>
        ) : null}
      </div>
    )
  );
  return (
    <ExpandablePanel
      title="Live Games"
      subtitle="Spectator-friendly battlefields"
      statusText={`${games.length} live${activeTournamentCount ? ` · ${activeTournamentCount} active events` : ""}`}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}

export default memo(LiveGamesModule);

