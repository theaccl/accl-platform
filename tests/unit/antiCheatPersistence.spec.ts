import { expect, test } from '@playwright/test';

import {
  InMemoryAntiCheatEventStore,
  InMemoryAntiCheatEnforcementStore,
  computeSuspicionTrend,
  deriveSignalCountsFromEvents,
  getIntegrityControlledTruth,
  recommendationForSuspicion,
  type SuspicionResult,
} from '../../lib/analysis';

const START_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B5/5N2/PPPPPPPP/RNBQK2R b KQkq - 2 2';

function stubTruthProvider() {
  return async () => ({
    rows: [],
    engine: {
      best_move: 'Nf6',
      candidate_moves: ['Nf6'],
      confidence: 0.61,
      depth: 16,
    },
    mode: 'coach' as const,
    tablebaseHook: null,
    openingDbHook: null,
  });
}

test.describe('Anti-cheat persistence + moderator scaffolding', () => {
  test('persists an anti-cheat event with stable required fields', async () => {
    const store = new InMemoryAntiCheatEventStore();

    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3', 'Nc6'],
        requestMoves: ['e4', 'e5', 'Nf3'],
        requestMarker: 'persist-1',
      },
      truthProvider: stubTruthProvider(),
      antiCheatStore: store,
      userId: '00000000-0000-0000-0000-000000000123',
      gameId: '00000000-0000-0000-0000-000000000456',
      nowEpochMs: 1_700_000_000_000,
    });

    expect(res.ok).toBe(true);
    const events = await store.listRecentEventsByUser('00000000-0000-0000-0000-000000000123', 5);
    expect(events.length).toBe(1);
    const first = events[0]!;
    expect(first.game_id).toBe('00000000-0000-0000-0000-000000000456');
    expect(first.fen).toBe(START_FEN);
    expect(first.overlap_verdict).toBe(res.audit.antiCheat.verdict);
    expect(first.suspicion_score).toBe(res.audit.antiCheat.suspicion.score);
    expect(first.suspicion_tier).toBe(res.audit.antiCheat.suspicion.tier);
    expect(Array.isArray(first.reasons_json)).toBe(true);
    expect(typeof first.created_at).toBe('string');
  });

  test('aggregation helpers compute counts and rolling trend', async () => {
    const store = new InMemoryAntiCheatEventStore();
    const uid = '00000000-0000-0000-0000-000000000999';

    await store.appendEvent({
      user_id: uid,
      game_id: null,
      fen: START_FEN,
      overlap_verdict: 'BOOK_OVERLAP',
      suspicion_score: 6,
      suspicion_tier: 'CLEAR',
      reasons_json: [{ signal: 'opening_book_overlap', occurrences: 1 }],
      protected_context: false,
      engine_called: true,
      request_context: {},
    });
    await store.appendEvent({
      user_id: uid,
      game_id: null,
      fen: START_FEN,
      overlap_verdict: 'CONFIRMED_OVERLAP',
      suspicion_score: 44,
      suspicion_tier: 'WARNING',
      reasons_json: [{ signal: 'repeated_probing', occurrences: 4 }],
      protected_context: true,
      engine_called: false,
      request_context: {},
    });

    const recent = await store.listRecentEventsByUser(uid, 10);
    const counts = deriveSignalCountsFromEvents(recent);
    expect(counts.openingBookOverlap).toBe(1);
    expect(counts.confirmedOverlap).toBe(1);
    expect(counts.protectedOverlapAttempt).toBe(1);
    expect(counts.blockedLiveProtectedRequest).toBe(1);
    expect(counts.blockedRequest).toBe(1);
    expect(counts.probingBurst).toBe(4);

    const trend = computeSuspicionTrend(recent);
    expect(trend.average).toBeGreaterThan(0);
    expect(Number.isFinite(trend.delta)).toBe(true);
  });

  test('historical persisted signals increase suspicion over clean baseline', async () => {
    const store = new InMemoryAntiCheatEventStore();
    const uid = '00000000-0000-0000-0000-000000000777';

    const baseline = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3'],
        requestMoves: ['e4', 'e5', 'Nc3'],
      },
      truthProvider: stubTruthProvider(),
      nowEpochMs: 1_700_000_000_000,
    });

    await store.appendEvent({
      user_id: uid,
      game_id: null,
      fen: START_FEN,
      overlap_verdict: 'CONFIRMED_OVERLAP',
      suspicion_score: 52,
      suspicion_tier: 'SOFT_LOCK_RECOMMENDED',
      reasons_json: [{ signal: 'repeated_probing', occurrences: 6 }],
      protected_context: true,
      engine_called: false,
      request_context: {},
    });

    const withHistory = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3'],
        requestMoves: ['e4', 'e5', 'Nc3'],
      },
      antiCheatStore: store,
      userId: uid,
      truthProvider: stubTruthProvider(),
      nowEpochMs: 1_700_000_000_000,
    });

    expect(withHistory.audit.antiCheat.suspicion.score).toBeGreaterThan(
      baseline.audit.antiCheat.suspicion.score
    );
  });

  test('recommendation mapping is deterministic by suspicion tier', async () => {
    const makeResult = (tier: SuspicionResult['tier']): SuspicionResult => ({
      score: 0,
      tier,
      reasons: [
        {
          signal: 'test_signal',
          strength: 'weak',
          weight: 1,
          occurrences: 1,
          overlapVerdict: 'CLEAR',
          protectedContext: false,
        },
      ],
      decayFactor: 1,
    });

    expect(recommendationForSuspicion(makeResult('CLEAR')).recommended_action).toBe('NO_ACTION');
    expect(recommendationForSuspicion(makeResult('WATCH')).recommended_action).toBe('MONITOR');
    expect(recommendationForSuspicion(makeResult('WARNING')).recommended_action).toBe('FLAG_ACCOUNT');
    expect(recommendationForSuspicion(makeResult('SOFT_LOCK_RECOMMENDED')).recommended_action).toBe(
      'RESTRICT_ANALYSIS_ACCESS'
    );
    expect(recommendationForSuspicion(makeResult('ESCALATE_REVIEW')).recommended_action).toBe(
      'SEND_TO_MODERATOR_QUEUE'
    );
  });

  test('clear/watch users remain unaffected by enforcement', async () => {
    const enforcementStore = new InMemoryAntiCheatEnforcementStore();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3'],
        requestMoves: ['e4', 'e5', 'Nc3'],
      },
      userId: '00000000-0000-0000-0000-000000000888',
      enforcementStore,
      truthProvider: stubTruthProvider(),
      nowEpochMs: 1_700_000_000_000,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(['NO_RESTRICTION', 'MONITOR_ONLY']).toContain(res.audit.enforcement.state);
      expect(res.audit.engineCalled).toBe(true);
    }
  });
});
