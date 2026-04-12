/**
 * Phase 24 — championship lifecycle derived from timestamps, live boards, and results.
 * No eligibility or outcome changes.
 */

import type { NexusGlobalEvent } from "@/lib/events/globalEventBuilder";
import type { ChampionshipTier, LifecycleState } from "@/lib/events/globalEventTypes";
import type { NexusLiveGame, NexusTournament, NexusWinner } from "@/lib/nexus/getNexusData";

export const COUNTDOWN_WINDOW_MS = 24 * 3600 * 1000;

export type { ChampionshipTier, LifecycleState } from "@/lib/events/globalEventTypes";

function norm(s: string): string {
  return s.toLowerCase();
}

export function deriveChampionshipTier(name: string, stage: string): ChampionshipTier {
  const t = `${name} ${stage}`.toLowerCase();
  if (/final\b|championship|finale|title match|title defense/.test(t)) return "finale";
  if (/semi/.test(t)) return "semifinal";
  if (/quarter/.test(t)) return "quarterfinal";
  return "showcase";
}

export function deriveIsChampionship(e: Pick<NexusGlobalEvent, "event_type" | "headline_importance">): boolean {
  return (
    e.event_type === "championship_event" ||
    e.event_type === "season_finale" ||
    (e.event_type === "cross_tier_showcase" && e.headline_importance === "high")
  );
}

function eventHasLiveMatch(e: NexusGlobalEvent, liveGames: NexusLiveGame[]): boolean {
  const ids = new Set(e.source_tournament_ids.map(String));
  return liveGames.some((g) => g.tournament_id && ids.has(String(g.tournament_id)));
}

function winnerMatchesEvent(e: NexusGlobalEvent, winners: NexusWinner[]): boolean {
  const title = norm(e.title);
  return winners.some((w) => {
    const en = norm(w.event_name);
    return en.includes(title.slice(0, Math.min(12, title.length))) || title.includes(en.slice(0, 8));
  });
}

function startMsForEvent(e: NexusGlobalEvent): number | null {
  const raw = e.window_start_utc;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export function deriveLifecycleState(
  e: NexusGlobalEvent,
  ctx: {
    hasLiveMatch: boolean;
    now: number;
    startMs: number | null;
    forceRecap: boolean;
  },
): LifecycleState {
  if (ctx.forceRecap) return "recap";
  if (ctx.hasLiveMatch) return "live";
  if (e.stage === "completed") return "recap";
  const start = ctx.startMs;
  if (start != null && start > ctx.now) {
    if (start - ctx.now <= COUNTDOWN_WINDOW_MS) return "countdown";
    return "announce";
  }
  if (start != null && start <= ctx.now && !ctx.hasLiveMatch && (e.stage === "active" || e.stage === "closing")) {
    return "announce";
  }
  if (e.stage === "upcoming" && start != null && start > ctx.now) {
    return start - ctx.now <= COUNTDOWN_WINDOW_MS ? "countdown" : "announce";
  }
  return "announce";
}

export function computeHeroPriority(
  e: NexusGlobalEvent & { lifecycle_state: LifecycleState; is_championship: boolean; championship_tier: ChampionshipTier },
): number {
  let h = 40;
  switch (e.lifecycle_state) {
    case "live":
      h = 82;
      break;
    case "countdown":
      h = 72;
      break;
    case "announce":
      h = 48;
      break;
    case "recap":
      h = 58;
      break;
    default:
      break;
  }
  if (e.is_championship && e.championship_tier === "finale") h += 14;
  else if (e.is_championship) h += 8;
  h += Math.min(10, Math.floor(e.priority / 12));
  return Math.min(100, Math.max(0, h));
}

export function enrichGlobalEventsWithLifecycle(
  events: NexusGlobalEvent[],
  input: {
    liveGames: NexusLiveGame[];
    tournaments: NexusTournament[];
    winners: NexusWinner[];
    now?: Date;
  },
): NexusGlobalEvent[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  return events.map((e) => {
    const t0 = input.tournaments.find((t) => e.source_tournament_ids.includes(t.id));
    const name = t0?.name ?? e.title;
    const stageStr = t0?.stage ?? e.title;
    const championship_tier = deriveChampionshipTier(String(name), String(stageStr));
    const is_championship = deriveIsChampionship(e) || e.event_type === "season_finale";
    const hasLive = eventHasLiveMatch(e, input.liveGames);
    const startMs = startMsForEvent(e);
    const forceRecap = e.stage === "completed" || (!hasLive && e.stage !== "upcoming" && winnerMatchesEvent(e, input.winners));

    const lifecycle_state = deriveLifecycleState(e, {
      hasLiveMatch: hasLive,
      now: nowMs,
      startMs,
      forceRecap: Boolean(forceRecap && !hasLive),
    });

    const countdown_at =
      lifecycle_state === "countdown" && startMs != null && startMs > nowMs ? new Date(startMs).toISOString() : null;

    const recap_available = lifecycle_state === "recap" && (winnerMatchesEvent(e, input.winners) || e.stage === "completed");

    const enriched: NexusGlobalEvent = {
      ...e,
      lifecycle_state,
      is_championship,
      championship_tier,
      countdown_at,
      recap_available,
      hero_priority: 0,
    };
    enriched.hero_priority = computeHeroPriority(enriched as NexusGlobalEvent & { lifecycle_state: LifecycleState; is_championship: boolean; championship_tier: ChampionshipTier });
    return enriched;
  });
}

export function buildGlobalEventLifecycleFeedItems(
  events: NexusGlobalEvent[],
  k12: boolean,
  generatedAt: string,
): Array<{
  id: string;
  kind: "global_event";
  message: string;
  utc: string;
  global_event_priority: true;
  feed_priority: "global";
}> {
  const rows: Array<{
    id: string;
    kind: "global_event";
    message: string;
    utc: string;
    global_event_priority: true;
    feed_priority: "global";
  }> = [];
  for (const e of events) {
    if (!e.is_championship) continue;
    const label = k12 ? e.title_k12 : e.title;
    if (e.lifecycle_state === "announce") {
      rows.push({
        id: `lf-an-${e.event_id}`,
        kind: "global_event",
        message: k12 ? `Top event announced · ${label}` : `Championship announced · ${label}`,
        utc: e.window_start_utc ?? generatedAt,
        global_event_priority: true,
        feed_priority: "global",
      });
    } else if (e.lifecycle_state === "countdown" && e.countdown_at) {
      rows.push({
        id: `lf-cd-${e.event_id}`,
        kind: "global_event",
        message: k12 ? `Final round begins soon · ${label}` : `Finale begins soon · ${label}`,
        utc: generatedAt,
        global_event_priority: true,
        feed_priority: "global",
      });
    } else if (e.lifecycle_state === "live") {
      rows.push({
        id: `lf-lv-${e.event_id}`,
        kind: "global_event",
        message: k12 ? `Top event now live · ${label}` : `Championship now live · ${label}`,
        utc: generatedAt,
        global_event_priority: true,
        feed_priority: "global",
      });
    } else if (e.lifecycle_state === "recap" && e.recap_available) {
      rows.push({
        id: `lf-rc-${e.event_id}`,
        kind: "global_event",
        message: k12 ? `Top performer recognized · ${label}` : `Champion crowned · ${label}`,
        utc: generatedAt,
        global_event_priority: true,
        feed_priority: "global",
      });
    }
  }
  return rows.slice(0, 10);
}
