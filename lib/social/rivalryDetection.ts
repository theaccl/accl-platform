/**
 * Phase 21 — rivalry signals derived from finished games (no stored leaderboard of “enemies”).
 */

export type FinishedHeadToHeadRow = {
  white_player_id: string;
  black_player_id: string;
  winner_id: string | null;
  tournament_id: string | null;
  finished_at: string | null;
};

export type PairAgg = {
  pairKey: string;
  aId: string;
  bId: string;
  matchCount: number;
  tournamentMeetings: number;
  aWins: number;
  bWins: number;
  draws: number;
  lastWinnerId: string | null;
  lastFinishedAt: string | null;
};

export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function orderedIds(idA: string, idB: string): { low: string; high: string } {
  return idA < idB ? { low: idA, high: idB } : { low: idB, high: idA };
}

/**
 * Whether this pairing qualifies as a tracked rivalry / frequent-opponent signal.
 */
export function isRivalPair(agg: Pick<PairAgg, "matchCount" | "tournamentMeetings" | "aWins" | "bWins">): boolean {
  const { matchCount, tournamentMeetings, aWins, bWins } = agg;
  const balanced = Math.min(aWins, bWins) >= 1 && Math.abs(aWins - bWins) <= 2;
  if (matchCount >= 4 && tournamentMeetings >= 1) return true;
  if (matchCount >= 3 && balanced) return true;
  if (matchCount >= 6) return true;
  return false;
}

export function aggregatePairs(rows: FinishedHeadToHeadRow[]): Map<string, PairAgg> {
  const map = new Map<string, PairAgg>();
  for (const r of rows) {
    const w = String(r.white_player_id ?? "").trim();
    const b = String(r.black_player_id ?? "").trim();
    if (!w || !b || w === b) continue;
    const key = pairKey(w, b);
    const { low, high } = orderedIds(w, b);
    const winner = String(r.winner_id ?? "").trim();
    const fin = r.finished_at;
    const prev = map.get(key);
    const next: PairAgg = prev ?? {
      pairKey: key,
      aId: low,
      bId: high,
      matchCount: 0,
      tournamentMeetings: 0,
      aWins: 0,
      bWins: 0,
      draws: 0,
      lastWinnerId: null,
      lastFinishedAt: null,
    };
    next.matchCount += 1;
    if (r.tournament_id) next.tournamentMeetings += 1;
    if (!winner) {
      next.draws += 1;
    } else if (winner === low) {
      next.aWins += 1;
    } else if (winner === high) {
      next.bWins += 1;
    }
    if (fin && (!next.lastFinishedAt || fin > next.lastFinishedAt)) {
      next.lastFinishedAt = fin;
      next.lastWinnerId = winner || null;
    }
    map.set(key, next);
  }
  return map;
}

export function filterCandidatePairs(
  aggs: Map<string, PairAgg>,
  candidateIds: Set<string>,
): PairAgg[] {
  const out: PairAgg[] = [];
  for (const agg of aggs.values()) {
    if (!candidateIds.has(agg.aId) || !candidateIds.has(agg.bId)) continue;
    out.push(agg);
  }
  return out;
}

export function outcomeForViewer(agg: PairAgg, viewerId: string): "win" | "loss" | "draw" | null {
  if (!agg.lastWinnerId) return agg.draws > 0 ? "draw" : null;
  if (agg.lastWinnerId === viewerId) return "win";
  const other = viewerId === agg.aId ? agg.bId : viewerId === agg.bId ? agg.aId : "";
  if (other && agg.lastWinnerId === other) return "loss";
  return null;
}
