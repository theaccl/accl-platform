import { createServiceRoleClient } from "@/lib/supabaseServiceRoleClient";
import type { NexusEcosystem, NexusLiveGame, NexusStanding, NexusWinner } from "@/lib/nexus/getNexusData";
import type { NexusSocialLayer } from "@/lib/social/buildNexusSocialLayer";
import { getSeasonMeta } from "@/lib/season/seasonManager";
import {
  buildChampionContext,
  buildNarrativeEvents,
  pickHeadline,
  type ChampionContext,
  type FinishedGameRow,
  type NarrativeEvent,
} from "@/lib/narrative/narrativeDetection";
import { pairKey } from "@/lib/social/rivalryDetection";

export type NexusSeasonContext = ChampionContext;

export type NexusNarrativeBundle = {
  headline: { headline: string; headline_k12: string; subline?: string };
  events: NarrativeEvent[];
};

const FINISHED_CAP = 72;

export async function loadFinishedGamesForNarrative(ecosystem: NexusEcosystem): Promise<FinishedGameRow[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("games")
    .select("id,white_player_id,black_player_id,winner_id,tournament_id,finished_at")
    .eq("status", "finished")
    .eq("ecosystem_scope", ecosystem)
    .not("winner_id", "is", null)
    .order("finished_at", { ascending: false })
    .limit(FINISHED_CAP);
  return (data ?? []) as FinishedGameRow[];
}

export async function buildNexusSeasonNarrative(
  ecosystem: NexusEcosystem,
  k12: boolean,
  standings: NexusStanding[],
  winners: NexusWinner[],
  social: NexusSocialLayer,
): Promise<{ season: NexusSeasonContext; narrative: NexusNarrativeBundle; finishedGames: FinishedGameRow[] }> {
  const current = getSeasonMeta();
  const champion = buildChampionContext(winners, current);
  const finishedGames = await loadFinishedGamesForNarrative(ecosystem);
  const events = buildNarrativeEvents({
    standings,
    winners,
    finishedGames,
    headToHead: social.head_to_head,
    champion,
    k12,
  });
  const headline = pickHeadline(events, champion, k12);
  return { season: champion, narrative: { headline, events }, finishedGames };
}

/** Attach lightweight tags for live boards — derived from season roles + rivalry + rating gap. */
export function enrichLiveGamesNarrative(
  games: NexusLiveGame[],
  season: ChampionContext,
  social: NexusSocialLayer,
): NexusLiveGame[] {
  return games.map((g) => {
    const tags: string[] = [];
    const w = g.white_player_id;
    const b = g.black_player_id;
    const cur = season.current_champion_user_id;
    const def = season.defending_champion_user_id;
    if (def && ((w && def === w) || (b && def === b))) {
      tags.push("Title defense");
    } else if (cur && ((w && cur === w) || (b && cur === b))) {
      tags.push("Season champion");
    }
    if (g.rivalry_match && w && b) {
      const pk = pairKey(w, b);
      if (social.head_to_head[pk]?.is_rival) tags.push("Rivalry rematch");
    }
    if (typeof g.white_rating === "number" && typeof g.black_rating === "number") {
      const gap = Math.abs(g.white_rating - g.black_rating);
      if (gap >= 130) tags.push("Underdog challenge");
    }
    if (tags.length === 0) return g;
    return { ...g, narrative_tags: [...new Set(tags)].slice(0, 4) };
  });
}
