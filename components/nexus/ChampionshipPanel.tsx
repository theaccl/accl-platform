"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import type { NexusGlobalEvent } from "@/lib/events/globalEventBuilder";
import type { NexusLiveGame, NexusWinner } from "@/lib/nexus/getNexusData";
import type { LifecycleState } from "@/lib/events/globalEventTypes";
import ExpandablePanel from "@/components/nexus/ExpandablePanel";
import ChampionshipCountdown from "@/components/nexus/ChampionshipCountdown";

function stateLabel(l: LifecycleState, k12: boolean): string {
  switch (l) {
    case "announce":
      return k12 ? "Announced" : "Announced";
    case "countdown":
      return k12 ? "Starting soon" : "Countdown";
    case "live":
      return "Live";
    case "recap":
      return k12 ? "Completed" : "Recap";
    default:
      return l;
  }
}

function timelineSteps(current: LifecycleState): LifecycleState[] {
  return ["announce", "countdown", "live", "recap"];
}

function ChampionshipPanel({
  events,
  liveGames,
  winners,
  k12,
}: {
  events: NexusGlobalEvent[];
  liveGames: NexusLiveGame[];
  winners: NexusWinner[];
  k12: boolean;
}) {
  const primary = useMemo(() => events.find((e) => e.is_championship) ?? null, [events]);

  const featuredMatches = useMemo(() => {
    if (!primary) return [];
    const ids = new Set(primary.source_tournament_ids.map(String));
    return liveGames.filter((g) => g.tournament_id && ids.has(String(g.tournament_id)) && g.is_championship_match);
  }, [primary, liveGames]);

  const progression = useMemo(() => {
    if (!primary) return [];
    const tid = primary.source_tournament_ids[0];
    if (!tid) return [];
    return winners
      .filter((w) => w.tier === "Tournament" || w.payout_category === "tournament_win")
      .slice(0, 4)
      .map((w) => w.player_label);
  }, [primary, winners]);

  if (!primary) return null;

  const steps = timelineSteps(primary.lifecycle_state);

  const collapsed = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
            k12 ? "border-cyan-500/50 text-cyan-100" : "border-amber-500/35 text-amber-100"
          }`}
        >
          {k12 ? "Top event" : "Championship"}
        </span>
        <span className="text-xs text-gray-400">{stateLabel(primary.lifecycle_state, k12)}</span>
      </div>
      <p className={`text-sm font-semibold ${k12 ? "text-cyan-50" : "text-amber-50"}`}>{k12 ? primary.title_k12 : primary.title}</p>
      {!k12 && primary.ecosystem_scope === "adult" && primary.sponsor_label ? (
        <p className="text-[10px] text-gray-500 mt-1">
          {primary.sponsor_tag ? <span className="text-gray-500">{primary.sponsor_tag} · </span> : null}
          <span className="text-gray-400">{primary.sponsor_label}</span>
        </p>
      ) : null}
      {primary.lifecycle_state === "countdown" && primary.countdown_at ? (
        <ChampionshipCountdown targetIso={primary.countdown_at} k12={k12} />
      ) : null}
      <Link
        href="/tournaments/active"
        className={`inline-block text-[11px] underline ${k12 ? "text-cyan-200" : "text-amber-200/90"}`}
      >
        {primary.lifecycle_state === "live" ? "Watch" : "View"}
      </Link>
    </div>
  );

  const expanded = (
    <div className="space-y-4 max-h-96 overflow-auto pr-1">
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Timeline</p>
        <div className="flex flex-wrap gap-2">
          {steps.map((s) => (
            <div
              key={s}
              className={`rounded-lg border px-2 py-1 text-[10px] ${
                s === primary.lifecycle_state
                  ? k12
                    ? "border-cyan-400/60 bg-cyan-950/40 text-cyan-100"
                    : "border-amber-400/40 bg-amber-950/30 text-amber-100"
                  : "border-gray-600 text-gray-500"
              }`}
            >
              {stateLabel(s, k12)}
            </div>
          ))}
        </div>
      </div>
      {featuredMatches.length > 0 ? (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Featured matches</p>
          <ul className="space-y-1">
            {featuredMatches.map((g) => (
              <li key={g.id}>
                <Link
                  href={k12 ? `/game/${g.id}?spectate=1&eco=k12` : `/game/${g.id}?spectate=1`}
                  className={`text-xs underline ${k12 ? "text-cyan-200" : "text-amber-200/90"}`}
                >
                  {g.white_label} vs {g.black_label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {progression.length > 0 ? (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Recent results</p>
          <p className="text-[11px] text-gray-400">{progression.join(" · ")}</p>
        </div>
      ) : null}
    </div>
  );

  return (
    <ExpandablePanel
      title={k12 ? "Season showcase" : "Championship"}
      subtitle="Structured lifecycle from real tournaments"
      statusText={stateLabel(primary.lifecycle_state, k12)}
      collapsed={collapsed}
      expanded={expanded}
      k12={k12}
    />
  );
}

export default memo(ChampionshipPanel);
