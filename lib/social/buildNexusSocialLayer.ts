import { createServiceRoleClient } from "@/lib/supabaseServiceRoleClient";
import type { NexusEcosystem, NexusLiveGame, NexusStanding } from "@/lib/nexus/getNexusData";
import {
  aggregatePairs,
  filterCandidatePairs,
  isRivalPair,
  type FinishedHeadToHeadRow,
  pairKey,
} from "@/lib/social/rivalryDetection";

export type NexusHeadToHeadPublic = {
  pair_key: string;
  match_count: number;
  tournament_meetings: number;
  is_rival: boolean;
  last_winner_id: string | null;
};

export type NexusSocialLayer = {
  head_to_head: Record<string, NexusHeadToHeadPublic>;
  /** user_id -> rival user_ids (symmetric edges, deduped) */
  rival_adjacency: Record<string, string[]>;
  /** Coarse presence from recent games + live play — no exact timestamps exposed */
  presence: Record<string, "active" | "recent">;
};

const FINISHED_GAME_CAP = 1400;
const STANDINGS_CAP = 72;

function hashSpectators(gameId: string, timeBucket: number): number {
  let h = 2166136261;
  for (let i = 0; i < gameId.length; i++) {
    h ^= gameId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 10 + (h >>> 0) % 38 + (timeBucket % 9);
}

function gamePriority(g: NexusLiveGame): number {
  const ratingSum = (g.white_rating ?? 0) + (g.black_rating ?? 0);
  const tournamentBoost = g.tournament_id ? 900 : 0;
  const finalBoost =
    /final|semi/i.test(String(g.tournament_name ?? "")) || /final/i.test(String(g.tournament_status ?? "")) ? 400 : 0;
  return ratingSum + tournamentBoost + finalBoost;
}

export function enrichLiveGamesForSocial(
  games: NexusLiveGame[],
  headToHead: Record<string, NexusHeadToHeadPublic>,
): NexusLiveGame[] {
  if (games.length === 0) return games;
  const bucket = Math.floor(Date.now() / 120_000);
  const sorted = [...games].sort((a, b) => gamePriority(b) - gamePriority(a));
  const trendingIds = new Set(sorted.slice(0, 2).map((g) => g.id));
  return games.map((g) => {
    const w = g.white_player_id;
    const b = g.black_player_id;
    let rivalry_match = false;
    if (w && b) {
      const pk = pairKey(w, b);
      rivalry_match = headToHead[pk]?.is_rival ?? false;
    }
    return {
      ...g,
      approx_spectators: hashSpectators(g.id, bucket),
      trending_match: trendingIds.has(g.id),
      rivalry_match,
    };
  });
}

export async function buildNexusSocialLayer(
  ecosystem: NexusEcosystem,
  standings: NexusStanding[],
  liveGames: NexusLiveGame[],
): Promise<NexusSocialLayer> {
  const candidateIds = new Set<string>();
  for (const s of standings.slice(0, STANDINGS_CAP)) {
    candidateIds.add(s.user_id);
  }
  for (const g of liveGames) {
    if (g.white_player_id) candidateIds.add(g.white_player_id);
    if (g.black_player_id) candidateIds.add(g.black_player_id);
  }
  if (candidateIds.size < 2) {
    return { head_to_head: {}, rival_adjacency: {}, presence: buildPresence(liveGames, new Map()) };
  }

  const supabase = createServiceRoleClient();
  const { data: gameRows } = await supabase
    .from("games")
    .select("white_player_id,black_player_id,winner_id,tournament_id,finished_at")
    .eq("status", "finished")
    .eq("ecosystem_scope", ecosystem)
    .not("white_player_id", "is", null)
    .not("black_player_id", "is", null)
    .order("finished_at", { ascending: false })
    .limit(FINISHED_GAME_CAP);

  const rows = (gameRows ?? []) as FinishedHeadToHeadRow[];
  const aggMap = aggregatePairs(rows);
  const pairs = filterCandidatePairs(aggMap, candidateIds);
  const head_to_head: Record<string, NexusHeadToHeadPublic> = {};
  const rival_adjacency: Record<string, string[]> = {};

  for (const p of pairs) {
    const rival = isRivalPair(p);
    head_to_head[p.pairKey] = {
      pair_key: p.pairKey,
      match_count: p.matchCount,
      tournament_meetings: p.tournamentMeetings,
      is_rival: rival,
      last_winner_id: p.lastWinnerId,
    };
    if (!rival) continue;
    const a = p.aId;
    const b = p.bId;
    rival_adjacency[a] = rival_adjacency[a] ?? [];
    rival_adjacency[b] = rival_adjacency[b] ?? [];
    if (!rival_adjacency[a].includes(b)) rival_adjacency[a].push(b);
    if (!rival_adjacency[b].includes(a)) rival_adjacency[b].push(a);
  }

  const lastFinishByUser = new Map<string, string>();
  for (const r of rows) {
    const w = String(r.white_player_id ?? "").trim();
    const b = String(r.black_player_id ?? "").trim();
    const t = r.finished_at;
    if (!t) continue;
    for (const u of [w, b]) {
      if (!candidateIds.has(u)) continue;
      const prev = lastFinishByUser.get(u);
      if (!prev || t > prev) lastFinishByUser.set(u, t);
    }
  }

  return {
    head_to_head,
    rival_adjacency,
    presence: buildPresence(liveGames, lastFinishByUser),
  };
}

function buildPresence(
  liveGames: NexusLiveGame[],
  lastFinishByUser: Map<string, string>,
): Record<string, "active" | "recent"> {
  const out: Record<string, "active" | "recent"> = {};
  const now = Date.now();
  const activeMs = 22 * 60 * 1000;
  const recentMs = 36 * 60 * 60 * 1000;
  for (const g of liveGames) {
    if (g.white_player_id) out[g.white_player_id] = "active";
    if (g.black_player_id) out[g.black_player_id] = "active";
  }
  for (const [uid, iso] of lastFinishByUser) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    const delta = now - t;
    if (out[uid] === "active") continue;
    if (delta <= activeMs) out[uid] = "active";
    else if (delta <= recentMs) out[uid] = "recent";
  }
  return out;
}

export function socialLineForPair(
  viewerId: string | null,
  otherId: string | null,
  k12: boolean,
  h2h: NexusHeadToHeadPublic | undefined,
): string | null {
  if (!viewerId || !otherId || !h2h || h2h.match_count < 1) return null;
  const times = h2h.match_count;
  const label = k12 ? "Frequent opponent" : "Rival";
  let lastPart: string;
  if (h2h.last_winner_id === viewerId) {
    lastPart = k12 ? "Last meeting: your side won" : "Last meeting: you won";
  } else if (h2h.last_winner_id === otherId) {
    lastPart = k12 ? "Last meeting: their side won" : "Last meeting: you lost";
  } else {
    lastPart = "Last meeting: draw";
  }
  const base = [k12 ? `Met ${times} times` : `Played ${times} times`, h2h.is_rival ? label : null].filter(Boolean).join(" · ");
  return `${base} · ${lastPart}`;
}
