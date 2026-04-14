import { memo } from "react";
import { Chessboard } from "react-chessboard";
import Link from "next/link";
import type { NexusLiveGame } from "@/lib/nexus/getNexusData";
import { assignPlayerIdentity } from "@/lib/reputation/titleAssignment";

function fmtRating(rating: number | null, tier: string | null) {
  if (typeof rating === "number") return `${rating}`;
  if (tier) return tier;
  return "Unrated";
}

function fmtClock(ms: number | null) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "--:--";
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function gamePhase(moveCount: number) {
  if (moveCount < 12) return "Opening";
  if (moveCount < 36) return "Middlegame";
  return "Endgame";
}

function timePressure(whiteMs: number | null, blackMs: number | null) {
  const min = Math.min(typeof whiteMs === "number" ? whiteMs : Number.MAX_SAFE_INTEGER, typeof blackMs === "number" ? blackMs : Number.MAX_SAFE_INTEGER);
  if (min === Number.MAX_SAFE_INTEGER) return "Clock Unknown";
  if (min < 30_000) return "Severe Time Pressure";
  if (min < 90_000) return "Time Pressure";
  return "Clock Stable";
}

function ratingGap(white: number | null, black: number | null) {
  if (typeof white !== "number" || typeof black !== "number") return "Rating Unknown";
  const gap = Math.abs(white - black);
  if (gap < 70) return "Balanced Matchup";
  if (gap < 180) return "Moderate Rating Gap";
  return "Wide Rating Gap";
}

function GameCardView({
  game,
  k12 = false,
  featured = false,
}: {
  game: NexusLiveGame;
  k12?: boolean;
  featured?: boolean;
}) {
  const phase = gamePhase(game.move_count);
  const pressure = timePressure(game.white_clock_ms, game.black_clock_ms);
  const matchup = ratingGap(game.white_rating, game.black_rating);
  const whiteId = assignPlayerIdentity({
    k12,
    rating: game.white_rating,
    tier: game.white_tier,
  });
  const blackId = assignPlayerIdentity({
    k12,
    rating: game.black_rating,
    tier: game.black_tier,
  });
  const whiteEmphasis = whiteId.titleLevel > blackId.titleLevel;
  const blackEmphasis = blackId.titleLevel > whiteId.titleLevel;
  const spec = typeof game.approx_spectators === "number";
  const showSocialStrip = game.rivalry_match || game.trending_match || spec;
  const spectateHref = k12 ? `/game/${game.id}?spectate=1&eco=k12` : `/game/${game.id}?spectate=1`;
  return (
    <Link
      href={spectateHref}
      prefetch
      className={`group block rounded-xl border p-3 sm:p-3 shadow-[0_8px_20px_rgba(0,0,0,0.24)] transition touch-manipulation active:scale-[0.99] ${
        k12 ? "border-[#2a4564] bg-[#0f1b2a] hover:border-cyan-500" : "border-[#2a3442] bg-[#0f1420] hover:border-red-500"
      }`}
    >
      <div className="relative">
        {game.is_championship_match ? (
          <p className="text-[9px] font-semibold mb-1">
            <span
              className={`inline-flex rounded px-1.5 py-0.5 border ${
                k12 ? "border-cyan-500/45 text-cyan-100" : "border-amber-500/40 text-amber-100"
              }`}
            >
              {k12 ? "Top event match" : "Championship match"}
            </span>
          </p>
        ) : null}
        {showSocialStrip ? (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] mb-1">
            {game.rivalry_match ? (
              <span className={k12 ? "text-cyan-200/90" : "text-violet-200/90"}>
                {k12 ? "Frequent-opponent match" : "Rival match"}
              </span>
            ) : null}
            {game.trending_match ? <span className="text-amber-200/85">Trending</span> : null}
            {spec ? <span className="text-gray-500">~{game.approx_spectators} watching</span> : null}
          </div>
        ) : null}
        <p className="text-xs text-gray-400 mb-1 break-words">{game.white_label} vs {game.black_label}</p>
        <div className="flex justify-between gap-2 text-[10px] text-gray-500 mb-2 min-h-[2.25rem]">
          <span
            className={`min-w-0 break-words leading-snug ${whiteEmphasis ? (k12 ? "text-cyan-100 font-medium" : "text-amber-100 font-medium") : ""}`}
          >
            {whiteId.rankIcon} {whiteId.title}
          </span>
          <span
            className={`min-w-0 text-right break-words leading-snug ${blackEmphasis ? (k12 ? "text-cyan-100 font-medium" : "text-amber-100 font-medium") : ""}`}
          >
            {blackId.rankIcon} {blackId.title}
          </span>
        </div>
        <div
          className={`mx-auto sm:mx-0 w-full ${featured ? "max-w-[min(92vw,280px)]" : "max-w-[min(92vw,220px)]"}`}
        >
          <Chessboard id={`nexus-${game.id}`} position={game.fen || "start"} />
        </div>
        <div
          className={`absolute inset-0 rounded-md opacity-0 group-active:opacity-100 md:group-hover:opacity-100 transition flex items-center justify-center pointer-events-none ${
            k12 ? "bg-[#072033]/80" : "bg-[#0b1019]/80"
          }`}
        >
          <div className="text-center">
            <p className="text-sm text-white font-semibold">{game.white_label} vs {game.black_label}</p>
            <p className="text-[10px] text-gray-300">
              {whiteId.title} · {fmtRating(game.white_rating, game.white_tier)}
            </p>
            <p className="text-[10px] text-gray-300">
              {blackId.title} · {fmtRating(game.black_rating, game.black_tier)}
            </p>
            <p className={`text-xs ${k12 ? "text-cyan-200" : "text-red-300"}`}>{game.time_control} • Spectate</p>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <p className={`${k12 ? "text-cyan-200" : "text-red-300"} flex items-center gap-1`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${k12 ? "bg-cyan-300" : "bg-red-400"}`} />
          LIVE • {game.time_control}
        </p>
        <p className="text-gray-300">
          {fmtClock(game.white_clock_ms)} / {fmtClock(game.black_clock_ms)}
        </p>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        {fmtRating(game.white_rating, game.white_tier)} vs {fmtRating(game.black_rating, game.black_tier)} • {game.move_count} moves
      </p>
      <p className="text-[11px] text-gray-400 mt-1">
        {phase} • {pressure} • {matchup}
      </p>
      {game.narrative_tags && game.narrative_tags.length > 0 ? (
        <p className="text-[10px] text-gray-500 mt-1">{game.narrative_tags.join(" · ")}</p>
      ) : null}
    </Link>
  );
}

export default memo(GameCardView);
