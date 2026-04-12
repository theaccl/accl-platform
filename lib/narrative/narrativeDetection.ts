/**
 * Phase 22 — narrative signals derived only from recorded results (no synthetic hype).
 */

import type { NexusStanding, NexusWinner } from "@/lib/nexus/getNexusData";
import type { NexusHeadToHeadPublic } from "@/lib/social/buildNexusSocialLayer";
import { pairKey } from "@/lib/social/rivalryDetection";
import { previousSeasonId, seasonIdForUtc, type SeasonMeta } from "@/lib/season/seasonManager";

export type NarrativeEventKind =
  | "upset"
  | "streak"
  | "champion_defeated"
  | "rivalry"
  | "breakthrough"
  | "title_defense"
  | "undefeated_run";

export type NarrativeEvent = {
  id: string;
  kind: NarrativeEventKind;
  message: string;
  message_k12: string;
  utc: string;
  game_id?: string | null;
};

export type FinishedGameRow = {
  id: string;
  white_player_id: string | null;
  black_player_id: string | null;
  winner_id: string | null;
  tournament_id: string | null;
  finished_at: string | null;
};

export type ChampionRow = {
  season_id: string;
  user_id: string | null;
  username: string;
  settled_at: string;
};

function rankOf(standings: NexusStanding[], userId: string): number | null {
  const s = standings.find((r) => r.user_id === userId);
  return s ? s.rank : null;
}

function isTournamentWinnerRow(w: NexusWinner): boolean {
  return w.tier === "Tournament" || w.payout_category === "tournament_win";
}

/** Latest tournament champion per season from payout feed. */
export function deriveSeasonChampions(winners: NexusWinner[]): ChampionRow[] {
  const tournamentWins = winners.filter(isTournamentWinnerRow);
  const bySeason = new Map<string, NexusWinner[]>();
  for (const w of tournamentWins) {
    const sid = seasonIdForUtc(w.utc);
    const list = bySeason.get(sid) ?? [];
    list.push(w);
    bySeason.set(sid, list);
  }
  const rows: ChampionRow[] = [];
  for (const [season_id, list] of bySeason) {
    const sorted = [...list].sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc));
    const top = sorted[0];
    if (!top) continue;
    rows.push({
      season_id,
      user_id: top.winner_user_id ?? null,
      username: top.player_label,
      settled_at: top.utc,
    });
  }
  return rows.sort((a, b) => b.season_id.localeCompare(a.season_id));
}

export type ChampionContext = {
  current_season: SeasonMeta;
  champions: ChampionRow[];
  current_champion_user_id: string | null;
  defending_champion_user_id: string | null;
  former_champion_user_ids: string[];
};

export function buildChampionContext(
  winners: NexusWinner[],
  currentSeason: SeasonMeta,
): ChampionContext {
  const champions = deriveSeasonChampions(winners);
  const curId = currentSeason.season_id;
  const prevId = previousSeasonId(curId);
  const curChamp = champions.find((c) => c.season_id === curId);
  const prevChamp = prevId ? champions.find((c) => c.season_id === prevId) : undefined;

  const current_champion_user_id = curChamp?.user_id ?? null;

  let defending_champion_user_id: string | null = null;
  if (prevChamp?.user_id) {
    if (!current_champion_user_id) {
      defending_champion_user_id = prevChamp.user_id;
    } else if (current_champion_user_id === prevChamp.user_id) {
      defending_champion_user_id = prevChamp.user_id;
    } else {
      defending_champion_user_id = null;
    }
  }

  const former = new Set<string>();
  for (const c of champions) {
    if (!c.user_id) continue;
    if (c.season_id === curId) continue;
    if (c.user_id === current_champion_user_id) continue;
    if (c.user_id === defending_champion_user_id) continue;
    former.add(c.user_id);
  }

  return {
    current_season: currentSeason,
    champions,
    current_champion_user_id,
    defending_champion_user_id,
    former_champion_user_ids: [...former].slice(0, 24),
  };
}

export function buildNarrativeEvents(input: {
  standings: NexusStanding[];
  winners: NexusWinner[];
  finishedGames: FinishedGameRow[];
  headToHead: Record<string, NexusHeadToHeadPublic>;
  champion: ChampionContext;
  k12: boolean;
}): NarrativeEvent[] {
  const { standings, winners, finishedGames, headToHead, champion } = input;
  const events: NarrativeEvent[] = [];
  const rankMap = new Map(standings.map((s) => [s.user_id, s.rank]));

  const champIds = new Set<string>();
  if (champion.current_champion_user_id) champIds.add(champion.current_champion_user_id);
  if (champion.defending_champion_user_id) champIds.add(champion.defending_champion_user_id);
  let championDefeats = 0;
  let upsetCount = 0;
  let rivCount = 0;

  for (const g of finishedGames) {
    const wid = String(g.winner_id ?? "").trim();
    const fin = g.finished_at;
    if (!wid || !fin) continue;
    const w = String(g.white_player_id ?? "").trim();
    const b = String(g.black_player_id ?? "").trim();
    const loser = wid === w ? b : wid === b ? w : "";
    if (!loser) continue;

    const wr = rankMap.get(wid);
    const lr = rankMap.get(loser);
    if (upsetCount < 8 && typeof wr === "number" && typeof lr === "number" && wr > lr && wr - lr >= 5) {
      upsetCount += 1;
      events.push({
        id: `n-upset-${g.id}`,
        kind: "upset",
        message: `Upset: #${wr} defeated #${lr}`,
        message_k12: `Big win: lower seed beat a higher seed`,
        utc: fin,
        game_id: g.id,
      });
    }

    if (championDefeats < 3 && champIds.has(loser) && !champIds.has(wid)) {
      championDefeats += 1;
      events.push({
        id: `n-champ-${g.id}`,
        kind: "champion_defeated",
        message: `Champion defeated in recorded play`,
        message_k12: `Strong result vs a defending champion`,
        utc: fin,
        game_id: g.id,
      });
    }

    const pk = w && b ? pairKey(w, b) : "";
    if (rivCount < 6 && pk && headToHead[pk]?.is_rival && g.tournament_id) {
      rivCount += 1;
      events.push({
        id: `n-riv-${g.id}`,
        kind: "rivalry",
        message: `Rivalry match in tournament play`,
        message_k12: `Frequent opponents met again in an event`,
        utc: fin,
        game_id: g.id,
      });
    }
  }

  const tw = winners.filter(isTournamentWinnerRow);
  const winCount = new Map<string, number>();
  for (const w of tw) {
    const uid = w.winner_user_id;
    if (!uid) continue;
    winCount.set(uid, (winCount.get(uid) ?? 0) + 1);
  }
  let breakN = 0;
  for (const [uid, n] of winCount) {
    if (n !== 1) continue;
    if (breakN >= 5) break;
    breakN += 1;
    const last = [...tw].filter((x) => x.winner_user_id === uid).sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc))[0];
    if (last) {
      events.push({
        id: `n-break-${uid.slice(0, 8)}`,
        kind: "breakthrough",
        message: `First tournament win recorded`,
        message_k12: `Great improvement — first event win`,
        utc: last.utc,
      });
    }
  }

  const topStreak = [...standings].sort((a, b) => b.streak - a.streak)[0];
  if (topStreak && topStreak.streak >= 5) {
    events.push({
      id: `n-str-${topStreak.user_id.slice(0, 8)}`,
      kind: "streak",
      message: `Streak: ${topStreak.streak} wins in a row (${topStreak.username})`,
      message_k12: `Strong run: ${topStreak.streak} wins in a row`,
      utc: new Date().toISOString(),
    });
  }
  const und = standings.find((s) => s.games >= 6 && s.wins === s.games);
  if (und) {
    events.push({
      id: `n-und-${und.user_id.slice(0, 8)}`,
      kind: "undefeated_run",
      message: `Undefeated run: ${und.wins}-${und.games - und.wins} (${und.username})`,
      message_k12: `Strong run: unbeaten in recent games`,
      utc: new Date().toISOString(),
    });
  }

  const sorted = events.sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc));
  const seen = new Set<string>();
  const out: NarrativeEvent[] = [];
  for (const e of sorted) {
    const k = `${e.kind}:${e.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= 18) break;
  }
  return out;
}

export function pickHeadline(
  events: NarrativeEvent[],
  champion: ChampionContext,
  k12: boolean,
): { headline: string; headline_k12: string; subline?: string } {
  const upset = events.find((e) => e.kind === "upset");
  const defeated = events.find((e) => e.kind === "champion_defeated");
  const streak = events.find((e) => e.kind === "streak");
  if (defeated && !k12) {
    return {
      headline: "Title pressure in play",
      headline_k12: "Big results shaping the season",
      subline: defeated.message,
    };
  }
  if (upset && !k12) {
    return { headline: "Upset shifts the board", headline_k12: "A surprising result landed", subline: upset.message };
  }
  if (streak) {
    return {
      headline: "Rising contender on a run",
      headline_k12: "Strong run building",
      subline: k12 ? streak.message_k12 : streak.message,
    };
  }
  if (champion.defending_champion_user_id && !k12) {
    return {
      headline: "Defending champion in the field",
      headline_k12: "Last season’s top performer is active",
      subline: `Season ${champion.current_season.season_id}`,
    };
  }
  return {
    headline: `Season ${champion.current_season.season_id} underway`,
    headline_k12: "Season story building from real results",
    subline: champion.current_season.status === "active" ? "Active season window" : undefined,
  };
}
