import { test, expect } from '@playwright/test';

import {
  buildExtendedBracketSlots,
  firstRoundPairings,
  planSingleEliminationBracket,
  matchKey,
  getBracketSizeFromPlans,
  totalRoundsForBracketSize,
  computeNextLink,
} from '../../lib/tournamentBracket';
import { sortEntriesForSeeding, toSeededParticipants } from '../../lib/tournamentSeeding';
import { classifyGameForRating } from '../../lib/ratingClassification';
import { precheckBracketPersist } from '../../lib/tournamentPersist';

type SimMatch = {
  round: number;
  p1: string | null;
  p2: string | null;
  winner: string | null;
  nextKey: string | null;
  advanceAs: 'player1' | 'player2' | null;
};

function buildSim(orderedUserIds: string[]) {
  const plans = planSingleEliminationBracket(orderedUserIds);
  const map = new Map<string, SimMatch>();
  for (const p of plans) {
    const k = matchKey(p.roundNumber, p.matchNumber);
    const nextKey =
      p.nextRound != null && p.nextMatchNumber != null ? matchKey(p.nextRound, p.nextMatchNumber) : null;
    map.set(k, {
      round: p.roundNumber,
      p1: p.player1Id,
      p2: p.player2Id,
      winner: null,
      nextKey,
      advanceAs: p.advanceWinnerAs,
    });
  }
  const bracketSize = getBracketSizeFromPlans(plans);
  const totalRounds = totalRoundsForBracketSize(bracketSize);
  return { map, totalRounds, plans };
}

function propagateWinner(
  map: Map<string, SimMatch>,
  key: string,
  winner: string,
  complete: { done: boolean },
  stats?: { completions: number }
) {
  const m = map.get(key);
  if (!m || m.winner != null) return;
  m.winner = winner;
  if (m.nextKey == null) {
    complete.done = true;
    if (stats) stats.completions += 1;
    return;
  }
  const next = map.get(m.nextKey);
  if (!next) return;
  if (m.advanceAs === 'player1') {
    if (next.p1 != null && next.p1 !== winner) {
      throw new Error('advance_conflict:player1');
    }
    next.p1 = winner;
  } else if (m.advanceAs === 'player2') {
    if (next.p2 != null && next.p2 !== winner) {
      throw new Error('advance_conflict:player2');
    }
    next.p2 = winner;
  }
  processByeOrSpawn(map, m.nextKey, complete, stats);
}

function processByeOrSpawn(map: Map<string, SimMatch>, key: string, complete: { done: boolean }, stats?: { completions: number }) {
  const m = map.get(key);
  if (!m || m.winner != null) return;
  if (m.p1 != null && m.p2 != null) return;
  if (m.round > 1) {
    if (m.p1 != null || m.p2 != null) return;
    return;
  }
  if (m.p1 != null && m.p2 == null) {
    propagateWinner(map, key, m.p1, complete, stats);
  } else if (m.p2 != null && m.p1 == null) {
    propagateWinner(map, key, m.p2, complete, stats);
  }
}

function bootstrapR1(map: Map<string, SimMatch>) {
  const complete = { done: false };
  for (let mi = 0; ; mi++) {
    const k = matchKey(1, mi);
    if (!map.has(k)) break;
    processByeOrSpawn(map, k, complete);
  }
  return complete;
}

function finishGame(map: Map<string, SimMatch>, key: string, winner: string, stats?: { completions: number }) {
  const complete = { done: false };
  propagateWinner(map, key, winner, complete, stats);
  return complete.done;
}

test.describe('tournament seeding', () => {
  test('sort by rating then created_at; seeds 1..N', () => {
    const sorted = sortEntriesForSeeding([
      { userId: 'a', ratingInBucket: 1500, createdAt: '2020-01-02' },
      { userId: 'b', ratingInBucket: 1600, createdAt: '2020-01-01' },
      { userId: 'c', ratingInBucket: 1600, createdAt: '2020-01-03' },
    ]);
    expect(sorted.map((e) => e.userId)).toEqual(['b', 'c', 'a']);
    const seeded = toSeededParticipants(sorted);
    expect(seeded.map((s) => s.seed)).toEqual([1, 2, 3]);
    expect(seeded.map((s) => s.userId)).toEqual(['b', 'c', 'a']);
  });
});

test.describe('bracket generation', () => {
  test('extended slots pad with nulls at end; R1 is 1 vs N pairing order', () => {
    const ordered = ['s1', 's2', 's3', 's4', 's5'];
    const ext = buildExtendedBracketSlots(ordered);
    expect(ext).toEqual(['s1', 's2', 's3', 's4', 's5', null, null, null]);
    const pairs = firstRoundPairings(ext);
    expect(pairs[0]).toEqual(['s1', null]);
    expect(pairs[1]).toEqual(['s2', null]);
    expect(pairs[2]).toEqual(['s3', null]);
    expect(pairs[3]).toEqual(['s4', 's5']);
  });

  test('full plan links each non-final match to parent via computeNextLink consistency', () => {
    const plans = planSingleEliminationBracket(['a', 'b', 'c', 'd']);
    const bracketSize = getBracketSizeFromPlans(plans);
    const totalRounds = totalRoundsForBracketSize(bracketSize);
    expect(totalRounds).toBe(2);
    for (const p of plans) {
      const link = computeNextLink(p.roundNumber, p.matchNumber, totalRounds);
      expect(link.nextRound).toBe(p.nextRound);
      expect(link.nextMatchNumber).toBe(p.nextMatchNumber);
      expect(link.advanceWinnerAs).toBe(p.advanceWinnerAs);
    }
    const final = plans.find((p) => p.roundNumber === totalRounds && p.matchNumber === 0);
    expect(final?.nextRound).toBeNull();
  });

  test('N=8 has 3 rounds and 7 matches', () => {
    const plans = planSingleEliminationBracket(Array.from({ length: 8 }, (_, i) => `p${i}`));
    expect(getBracketSizeFromPlans(plans)).toBe(8);
    expect(totalRoundsForBracketSize(8)).toBe(3);
    expect(plans.length).toBe(7);
  });
});

test.describe('advancement and completion', () => {
  test('N=4: bootstrap and finish games → final winner completes bracket', () => {
    const ordered = ['a', 'b', 'c', 'd'];
    const { map, totalRounds } = buildSim(ordered);
    expect(totalRounds).toBe(2);
    bootstrapR1(map);
    // R1: a vs d, b vs c — both live games
    expect(map.get(matchKey(1, 0))?.winner).toBeNull();
    let done = finishGame(map, matchKey(1, 0), 'a');
    expect(done).toBe(false);
    done = finishGame(map, matchKey(1, 1), 'b');
    expect(done).toBe(false);
    expect(map.get(matchKey(2, 0))?.p1).toBe('a');
    expect(map.get(matchKey(2, 0))?.p2).toBe('b');
    done = finishGame(map, matchKey(2, 0), 'b');
    expect(done).toBe(true);
    expect(map.get(matchKey(2, 0))?.winner).toBe('b');
  });

  test('bye auto-advances when opponent slot is null (R1 first pairing)', () => {
    const ordered = ['a', 'b', 'c'];
    const { map } = buildSim(ordered);
    bootstrapR1(map);
    expect(map.get(matchKey(1, 0))?.winner).toBe('a');
    expect(map.get(matchKey(1, 1))?.winner).toBeNull();
  });

  test('R2+ waits when only one feeder arrived (no premature bye)', () => {
    const { map } = buildSim(['a', 'b', 'c', 'd']);
    bootstrapR1(map);
    finishGame(map, matchKey(1, 0), 'a');
    const final = map.get(matchKey(2, 0));
    expect(final?.p1).toBe('a');
    expect(final?.p2).toBeNull();
    expect(final?.winner).toBeNull();
  });

  test('final completion counted once; double finish does not re-complete', () => {
    const { map } = buildSim(['a', 'b', 'c', 'd']);
    bootstrapR1(map);
    finishGame(map, matchKey(1, 0), 'a');
    finishGame(map, matchKey(1, 1), 'b');
    const stats = { completions: 0 };
    const fk = matchKey(2, 0);
    expect(finishGame(map, fk, 'b', stats)).toBe(true);
    expect(stats.completions).toBe(1);
    finishGame(map, fk, 'a', stats);
    expect(stats.completions).toBe(1);
    expect(map.get(fk)?.winner).toBe('b');
  });

  test('advancing into occupied feeder slot is an integrity violation', () => {
    const { map } = buildSim(['a', 'b', 'c', 'd']);
    bootstrapR1(map);
    map.get(matchKey(2, 0))!.p1 = 'x';
    expect(() => finishGame(map, matchKey(1, 0), 'a')).toThrow(/advance_conflict:player1/);
  });
});

test.describe('bracket persist guards', () => {
  test('active + existing matches → idempotent replay', () => {
    expect(precheckBracketPersist('active', 7).action).toBe('idempotent_return');
  });

  test('pending + existing matches → incomplete', () => {
    const g = precheckBracketPersist('pending', 1);
    expect(g.action).toBe('reject');
    if (g.action === 'reject') expect(g.code).toBe('incomplete');
  });

  test('completed → reject', () => {
    const g = precheckBracketPersist('completed', 0);
    expect(g.action).toBe('reject');
    if (g.action === 'reject') expect(g.code).toBe('completed');
  });

  test('active + zero matches → reject new insert path', () => {
    const g = precheckBracketPersist('active', 0);
    expect(g.action).toBe('reject');
    if (g.action === 'reject') expect(g.code).toBe('wrong_status_for_new');
  });

  test('fresh pending tournament → insert', () => {
    expect(precheckBracketPersist('pending', 0).action).toBe('insert_new');
  });
});

test.describe('match spawn idempotency (contract)', () => {
  test('try_spawn no-op when game_id already linked', () => {
    const row = { game_id: 'g-1' as string | null, winner_id: null as string | null, p1: 'a', p2: 'b' };
    const mayInsert =
      row.game_id == null && row.winner_id == null && row.p1 != null && row.p2 != null;
    expect(mayInsert).toBe(false);
  });
});

test.describe('rating classification for tournament games', () => {
  test('finished tournament rated → deferred_bracket', () => {
    const c = classifyGameForRating({
      status: 'finished',
      white_player_id: 'w',
      black_player_id: 'b',
      play_context: 'tournament',
      tempo: 'live',
      rated: true,
    });
    expect(c.bucket).toBe('tournament_live');
    expect(c.updateTiming).toBe('deferred_bracket');
  });
});
