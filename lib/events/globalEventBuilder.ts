/**
 * Phase 23–24 — global / championship event framing derived from real tournaments,
 * scheduled Nexus events, and season boundaries. No synthetic competitions.
 */

import type {
  NexusEcosystem,
  NexusLiveGame,
  NexusTournament,
  NexusUpcomingEvent,
  NexusWinner,
} from "@/lib/nexus/getNexusData";
import type { SeasonMeta } from "@/lib/season/seasonManager";
import type { ChampionshipTier, LifecycleState } from "@/lib/events/globalEventTypes";

export type GlobalEventType =
  | "season_finale"
  | "cross_tier_showcase"
  | "championship_event"
  | "redemption_spotlight"
  | "special_invitational";

export type GlobalEventStage = "upcoming" | "active" | "closing" | "completed";

export type GlobalEventImportance = "mega" | "high" | "standard";

export type NexusGlobalEvent = {
  event_id: string;
  title: string;
  title_k12: string;
  event_type: GlobalEventType;
  ecosystem_scope: NexusEcosystem;
  stage: GlobalEventStage;
  window_start_utc: string | null;
  window_end_utc: string | null;
  source_tournament_ids: string[];
  source_upcoming_ids: string[];
  priority: number;
  headline_importance: GlobalEventImportance;
  /** Optional copy hook for narrative / archive cross-links */
  narrative_hint?: string;
  /** Phase 24 — derived lifecycle */
  lifecycle_state: LifecycleState;
  is_championship: boolean;
  championship_tier: ChampionshipTier;
  countdown_at: string | null;
  recap_available: boolean;
  hero_priority: number;
  /** Phase 26 — optional sponsor placeholders (adult UI only; never shown on K–12). */
  sponsor_tag?: string | null;
  sponsor_label?: string | null;
};

const FINALE_MS = 14 * 24 * 3600 * 1000;

function phase24Placeholders(): Pick<
  NexusGlobalEvent,
  "lifecycle_state" | "is_championship" | "championship_tier" | "countdown_at" | "recap_available" | "hero_priority"
> {
  return {
    lifecycle_state: "announce",
    is_championship: false,
    championship_tier: "showcase",
    countdown_at: null,
    recap_available: false,
    hero_priority: 50,
  };
}

function norm(s: string): string {
  return s.toLowerCase();
}

function stageFromTournamentStatus(status: string | undefined): GlobalEventStage {
  const s = norm(String(status ?? ""));
  if (s.includes("complete") || s.includes("finished")) return "completed";
  if (s.includes("closing") || s.includes("wrap")) return "closing";
  if (s.includes("live") || s.includes("active") || s.includes("progress")) return "active";
  return "active";
}

function classifyFromTitle(title: string): { type: GlobalEventType; base: number } | null {
  const n = norm(title);
  if (/invitational|invite-only|invite only/.test(n)) return { type: "special_invitational", base: 60 };
  if (/redemption|last chance|qualifier|second chance/.test(n)) return { type: "redemption_spotlight", base: 70 };
  if (/showcase|cross.tier|all.tier|multi.tier|field|open field/.test(n)) return { type: "cross_tier_showcase", base: 80 };
  if (/championship|title defense|defend the|title match|champion\b/.test(n)) return { type: "championship_event", base: 90 };
  if (/finale|final week|championship week|season end|closing week|season finale/.test(n)) return { type: "season_finale", base: 95 };
  return null;
}

function importanceFor(type: GlobalEventType, inFinaleWindow: boolean): GlobalEventImportance {
  if (type === "season_finale" && inFinaleWindow) return "mega";
  if (type === "championship_event") return "high";
  if (type === "cross_tier_showcase") return "high";
  return "standard";
}

export function isSeasonFinaleWindow(now: Date, season: SeasonMeta): boolean {
  if (season.status !== "active") return false;
  const end = Date.parse(season.end_at);
  if (!Number.isFinite(end)) return false;
  const t = now.getTime();
  return t >= end - FINALE_MS && t <= end;
}

export function buildGlobalEvents(input: {
  ecosystem: NexusEcosystem;
  activeTournaments: NexusTournament[];
  upcomingEvents: NexusUpcomingEvent[];
  season: SeasonMeta;
  now?: Date;
}): NexusGlobalEvent[] {
  const now = input.now ?? new Date();
  const k12 = input.ecosystem === "k12";
  const inFinale = isSeasonFinaleWindow(now, input.season);
  const out: NexusGlobalEvent[] = [];

  for (const t of input.activeTournaments) {
    const name = String(t.name ?? "");
    const classified = classifyFromTitle(name);
    if (!classified) continue;
    const stage = stageFromTournamentStatus(t.round_status);
    const type = classified.type;
    const boost = /final|semi|championship|title/i.test(`${name} ${t.stage}`) ? 8 : 0;
    const priority = classified.base + boost + (inFinale && type === "season_finale" ? 12 : 0);
    const sponsorTag = t.sponsor_tag?.trim() || null;
    const sponsorLabel = t.sponsor_label?.trim() || null;
    out.push({
      event_id: `tournament:${t.id}`,
      title: name,
      title_k12: k12 ? name.replace(/championship/gi, "Showcase").replace(/title defense/gi, "Defense round") : name,
      event_type: type,
      ecosystem_scope: input.ecosystem,
      stage,
      window_start_utc: t.start_utc,
      window_end_utc: null,
      source_tournament_ids: [t.id],
      source_upcoming_ids: [],
      priority,
      headline_importance: importanceFor(type, inFinale),
      narrative_hint: k12 ? "Season storylines from real results" : "Landmark competitive moment from structured events",
      sponsor_tag: sponsorTag,
      sponsor_label: sponsorLabel,
      ...phase24Placeholders(),
    });
  }

  for (const u of input.upcomingEvents) {
    const title = String(u.title ?? "");
    const classified = classifyFromTitle(title);
    if (!classified) continue;
    const utc = String(u.utc_start ?? "");
    const startMs = Date.parse(utc);
    const stage: GlobalEventStage =
      Number.isFinite(startMs) && startMs > now.getTime() ? "upcoming" : "active";
    const type = classified.type;
    const priority = classified.base + (type === "special_invitational" ? 6 : 0);
    out.push({
      event_id: `upcoming:${u.id}`,
      title,
      title_k12: k12 ? title.replace(/championship/gi, "Showcase") : title,
      event_type: type,
      ecosystem_scope: input.ecosystem,
      stage,
      window_start_utc: utc,
      window_end_utc: null,
      source_tournament_ids: [],
      source_upcoming_ids: [u.id],
      priority,
      headline_importance: importanceFor(type, inFinale),
      narrative_hint: k12 ? "School-safe scheduled event" : "Scheduled structured event",
      sponsor_tag: null,
      sponsor_label: null,
      ...phase24Placeholders(),
    });
  }

  if (inFinale && input.activeTournaments.length > 0) {
    const ids = input.activeTournaments.map((t) => t.id);
    const title = `Season finale · ${input.season.season_id}`;
    const title_k12 = k12 ? `Season showcase · ${input.season.season_id}` : title;
    out.push({
      event_id: `season:${input.season.season_id}:finale`,
      title,
      title_k12,
      event_type: "season_finale",
      ecosystem_scope: input.ecosystem,
      stage: "closing",
      window_start_utc: input.season.start_at,
      window_end_utc: input.season.end_at,
      source_tournament_ids: ids,
      source_upcoming_ids: [],
      priority: 110,
      headline_importance: "mega",
      narrative_hint: k12 ? "Top performers close the season" : "Title lines and standings converge",
      sponsor_tag: null,
      sponsor_label: null,
      ...phase24Placeholders(),
    });
  }

  const seen = new Map<string, NexusGlobalEvent>();
  for (const e of out.sort((a, b) => b.priority - a.priority)) {
    if (!seen.has(e.event_id)) seen.set(e.event_id, e);
  }
  return [...seen.values()].sort((a, b) => b.priority - a.priority);
}

export function enrichLiveGamesWithGlobalEvents(
  games: NexusLiveGame[],
  events: NexusGlobalEvent[],
): NexusLiveGame[] {
  if (events.length === 0) return games;
  const byTid = new Map<string, NexusGlobalEvent>();
  for (const e of events) {
    for (const tid of e.source_tournament_ids) {
      const cur = byTid.get(tid);
      if (!cur || e.priority > cur.priority) byTid.set(tid, e);
    }
  }
  const chip = (e: NexusGlobalEvent, k12: boolean) => {
    if (e.event_type === "season_finale") return k12 ? "Showcase" : "Finale";
    if (e.event_type === "championship_event") return k12 ? "Showcase" : "Championship";
    if (e.event_type === "cross_tier_showcase") return k12 ? "Showcase" : "Showcase";
    if (e.event_type === "redemption_spotlight") return k12 ? "Qualifier" : "Redemption";
    if (e.event_type === "special_invitational") return k12 ? "Invited" : "Invitational";
    return "Event";
  };
  return games.map((g) => {
    const tid = g.tournament_id ? String(g.tournament_id) : "";
    if (!tid) return g;
    const ev = byTid.get(tid);
    if (!ev) return g;
    const k12 = ev.ecosystem_scope === "k12";
    return {
      ...g,
      global_event_id: ev.event_id,
      global_event_chip: chip(ev, k12),
      global_event_mega: ev.headline_importance === "mega",
      is_championship_match: Boolean(ev.is_championship && ev.lifecycle_state === "live"),
      championship_lifecycle: ev.lifecycle_state,
    };
  });
}

export function pickGlobalSpotlightPair(
  games: NexusLiveGame[],
  events: NexusGlobalEvent[],
): { game: NexusLiveGame; event: NexusGlobalEvent } | null {
  if (games.length === 0 || events.length === 0) return null;
  const sortedEvents = [...events].sort((a, b) => b.hero_priority - a.hero_priority || b.priority - a.priority);
  for (const ev of sortedEvents) {
    if (ev.stage !== "active" && ev.stage !== "closing") continue;
    for (const tid of ev.source_tournament_ids) {
      const g = games.find((x) => x.tournament_id && String(x.tournament_id) === tid);
      if (g) return { game: g, event: ev };
    }
  }
  return null;
}

export type SpotlightKind = "championship_live" | "championship_countdown" | "global_live" | "standard";

export function pickChampionshipSpotlight(
  games: NexusLiveGame[],
  events: NexusGlobalEvent[],
): { game: NexusLiveGame | null; event: NexusGlobalEvent | null; spotlightKind: SpotlightKind } {
  if (events.length === 0) {
    const g = games.find((x) => x.tournament_id && x.tournament_name) ?? null;
    return { game: g, event: null, spotlightKind: g ? "standard" : "standard" };
  }
  const sorted = [...events].sort((a, b) => b.hero_priority - a.hero_priority || b.priority - a.priority);
  for (const ev of sorted) {
    if (!ev.is_championship) continue;
    if (ev.lifecycle_state === "live") {
      for (const tid of ev.source_tournament_ids) {
        const g = games.find((x) => x.tournament_id && String(x.tournament_id) === tid);
        if (g) return { game: g, event: ev, spotlightKind: "championship_live" };
      }
    }
  }
  for (const ev of sorted) {
    if (!ev.is_championship) continue;
    if (ev.lifecycle_state === "countdown") {
      return { game: null, event: ev, spotlightKind: "championship_countdown" };
    }
  }
  const gp = pickGlobalSpotlightPair(games, events);
  if (gp) return { game: gp.game, event: gp.event, spotlightKind: "global_live" };
  const g = games.find((x) => x.tournament_id && x.tournament_name) ?? null;
  return { game: g, event: null, spotlightKind: g ? "standard" : "standard" };
}

export function buildGlobalEventFeedItems(
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
    if (e.is_championship) continue;
    if (e.stage !== "active" && e.stage !== "closing" && e.stage !== "upcoming") continue;
    const label = k12 ? e.title_k12 : e.title;
    if (e.stage === "upcoming") {
      rows.push({
        id: `ge-up-${e.event_id}`,
        kind: "global_event",
        message: k12 ? `Season showcase scheduled · ${label}` : `Major event scheduled · ${label}`,
        utc: e.window_start_utc ?? generatedAt,
        global_event_priority: true,
        feed_priority: "global",
      });
    } else if (e.event_type === "season_finale") {
      rows.push({
        id: `ge-live-${e.event_id}`,
        kind: "global_event",
        message: k12 ? `Season showcase spotlight · ${label}` : `Season finale spotlight · ${label}`,
        utc: generatedAt,
        global_event_priority: true,
        feed_priority: "global",
      });
    } else {
      rows.push({
        id: `ge-live-${e.event_id}`,
        kind: "global_event",
        message: k12 ? `Top performers event · ${label}` : `Championship event live · ${label}`,
        utc: generatedAt,
        global_event_priority: true,
        feed_priority: "global",
      });
    }
  }
  return rows.slice(0, 12);
}

function normLabel(s: string): string {
  return s.toLowerCase().trim();
}

/** Phase 24 — champion / finalist labels from verified winners feed + board context */
export function inferChampionshipContextLabel(
  userId: string | null | undefined,
  game: NexusLiveGame,
  event: NexusGlobalEvent | null | undefined,
  winners: NexusWinner[],
  k12: boolean,
): string | null {
  if (!userId || !event?.is_championship) return null;
  const tn = normLabel(String(game.tournament_name ?? ""));
  const won = winners.some(
    (w) =>
      w.winner_user_id === userId &&
      tn.length > 0 &&
      normLabel(w.event_name).includes(tn.slice(0, Math.min(12, tn.length))),
  );
  if (won) return k12 ? "Top performer" : "Champion";
  const finals = /final|championship|title/i.test(`${game.tournament_name ?? ""} ${game.tournament_status ?? ""}`);
  if (finals) return k12 ? "Final round" : "Championship Finalist";
  return null;
}

export function inferEventContextLabel(
  userId: string | null | undefined,
  game: NexusLiveGame,
  globalEvent: NexusGlobalEvent | null | undefined,
  season: {
    defending_champion_user_id: string | null;
    current_champion_user_id: string | null;
  },
): string | null {
  if (!userId || !globalEvent) return null;
  const text = `${game.tournament_name ?? ""} ${game.tournament_status ?? ""}`.toLowerCase();
  const isFinals = /final|championship|title/i.test(text);
  const def = season.defending_champion_user_id;
  const cur = season.current_champion_user_id;
  if (def === userId && isFinals) return "Defending champion";
  if (cur === userId && isFinals && def !== userId) return "Season champion";
  if (globalEvent.event_type === "special_invitational") return "Invited player";
  if (isFinals) return "Finalist";
  if (def && userId !== def && (game.white_player_id === userId || game.black_player_id === userId)) return "Challenger";
  return null;
}
