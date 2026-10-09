import { expect, test } from '@playwright/test';

import {
  InMemoryAntiCheatEventStore,
  InMemoryAntiCheatEnforcementStore,
  InMemoryModeratorQueueSink,
  computeSuspicionTrend,
  deriveSignalCountsFromEvents,
  getIntegrityControlledTruth,
  recommendationForSuspicion,
  type AntiCheatEnforcementStore,
  type AntiCheatEventStore,
  type AntiCheatSignalCounts,
  type ModeratorQueueSink,
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

  test('mandatory persisted signals remain active when no overlap object exists', async () => {
    const store = new InMemoryAntiCheatEventStore();
    const uid = '00000000-0000-0000-0000-000000000778';
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

    const result = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'completed-game-review' },
      userId: uid,
      gameId: '00000000-0000-0000-0000-000000000456',
      antiCheatStore: store,
      enforcementStore: new InMemoryAntiCheatEnforcementStore(),
      moderatorQueueSink: new InMemoryModeratorQueueSink(),
      requireDurableControls: true,
      truthProvider: stubTruthProvider(),
      nowEpochMs: Date.now(),
    });

    expect(result.audit.antiCheat.matchSummary.repeatedProbeCount).toBe(6);
    expect(result.audit.antiCheat.suspicion.score).toBeGreaterThan(0);
  });

  test('mandatory history rejects negative, non-finite, oversized, and contradictory counts', async () => {
    const invalid: AntiCheatSignalCounts[] = [
      { blockedRequest: -1 },
      { blockedRequest: Number.POSITIVE_INFINITY },
      { blockedRequest: 10_001 },
      { probingBurst: 4, blockedRequest: 0.5 },
      { blockedLiveProtectedRequest: 2, protectedOverlapAttempt: 1, blockedRequest: 2 },
      { blockedLiveProtectedRequest: 2, protectedOverlapAttempt: 2, blockedRequest: 1 },
    ];

    for (const counts of invalid) {
      const store: AntiCheatEventStore = {
        appendEvent: async () => {},
        countRecentSignalsByUser: async () => counts,
        listRecentEventsByUser: async () => [],
        computeRollingSuspicionTrendByUser: async () => ({
          latest: 0,
          oldest: 0,
          average: 0,
          delta: 0,
        }),
      };
      await expect(
        getIntegrityControlledTruth({
          fen: START_FEN,
          mode: 'coach',
          context: { type: 'completed-game-review' },
          userId: '00000000-0000-0000-0000-000000000779',
          antiCheatStore: store,
          enforcementStore: new InMemoryAntiCheatEnforcementStore(),
          moderatorQueueSink: new InMemoryModeratorQueueSink(),
          requireDurableControls: true,
          truthProvider: stubTruthProvider(),
        })
      ).rejects.toMatchObject({
        name: 'IntegrityControlUnavailableError',
        code: 'ANTI_CHEAT_EVIDENCE_INVALID',
      });
    }
  });

  test('a clean request cannot downgrade an existing restrictive enforcement baseline', async () => {
    const uid = '00000000-0000-0000-0000-000000000780';
    const enforcementStore = new InMemoryAntiCheatEnforcementStore();
    await enforcementStore.upsertFromRecommendation({
      userId: uid,
      suspicionTier: 'SOFT_LOCK_RECOMMENDED',
      recommendation: recommendationForSuspicion({
        score: 50,
        tier: 'SOFT_LOCK_RECOMMENDED',
        reasons: [],
        decayFactor: 1,
      }),
      reasonJson: [],
    });
    let engineCalled = false;

    const result = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'completed-game-review' },
      userId: uid,
      antiCheatStore: new InMemoryAntiCheatEventStore(),
      enforcementStore,
      moderatorQueueSink: new InMemoryModeratorQueueSink(),
      requireDurableControls: true,
      truthProvider: async () => {
        engineCalled = true;
        return stubTruthProvider()();
      },
    });

    expect(result.ok).toBe(false);
    expect(engineCalled).toBe(false);
    expect(result.audit.enforcement.baselineState).toBe('TRAINER_LOCKED');
  });

  test('mandatory controls fail closed for history, enforcement, audit, and queue failures', async () => {
    const validHistory: AntiCheatEventStore = {
      appendEvent: async () => {},
      countRecentSignalsByUser: async () => ({}),
      listRecentEventsByUser: async () => [],
      computeRollingSuspicionTrendByUser: async () => ({ latest: 0, oldest: 0, average: 0, delta: 0 }),
    };
    const validEnforcement = new InMemoryAntiCheatEnforcementStore();
    const base = {
      fen: START_FEN,
      mode: 'coach' as const,
      context: { type: 'completed-game-review' as const },
      userId: '00000000-0000-0000-0000-000000000781',
      requireDurableControls: true,
      truthProvider: stubTruthProvider(),
    };

    const historyFailure: AntiCheatEventStore = {
      ...validHistory,
      countRecentSignalsByUser: async () => {
        throw new Error('history unavailable');
      },
    };
    await expect(
      getIntegrityControlledTruth({
        ...base,
        antiCheatStore: historyFailure,
        enforcementStore: validEnforcement,
        moderatorQueueSink: new InMemoryModeratorQueueSink(),
      })
    ).rejects.toMatchObject({ code: 'ANTI_CHEAT_HISTORY_UNAVAILABLE' });

    const enforcementFailure: AntiCheatEnforcementStore = {
      upsertFromRecommendation: async () => {},
      getEffectiveState: async () => {
        throw new Error('enforcement unavailable');
      },
      getStateDetails: async () => null,
      applyModeratorOverride: async () => {
        throw new Error('unused');
      },
    };
    await expect(
      getIntegrityControlledTruth({
        ...base,
        antiCheatStore: validHistory,
        enforcementStore: enforcementFailure,
        moderatorQueueSink: new InMemoryModeratorQueueSink(),
      })
    ).rejects.toMatchObject({ code: 'ENFORCEMENT_UNAVAILABLE' });

    const contradictoryEnforcement: AntiCheatEnforcementStore = {
      upsertFromRecommendation: async () => {},
      getEffectiveState: async () => ({
        userId: base.userId,
        state: 'NO_RESTRICTION',
        source: 'baseline',
        baselineState: 'TRAINER_LOCKED',
        overrideAction: null,
        overrideReason: null,
        overrideExpiresAt: null,
        sourceSuspicionTier: 'SOFT_LOCK_RECOMMENDED',
        sourceRecommendedAction: 'RESTRICT_ANALYSIS_ACCESS',
        createdAt: null,
        updatedAt: null,
      }),
      getStateDetails: async () => null,
      applyModeratorOverride: async () => {
        throw new Error('unused');
      },
    };
    await expect(
      getIntegrityControlledTruth({
        ...base,
        antiCheatStore: validHistory,
        enforcementStore: contradictoryEnforcement,
        moderatorQueueSink: new InMemoryModeratorQueueSink(),
      })
    ).rejects.toMatchObject({ code: 'ANTI_CHEAT_EVIDENCE_INVALID' });

    const enforcementWriteFailure: AntiCheatEnforcementStore = {
      upsertFromRecommendation: async () => {
        throw new Error('enforcement write unavailable');
      },
      getEffectiveState: async () => ({
        userId: base.userId,
        state: 'NO_RESTRICTION',
        source: 'baseline',
        baselineState: 'NO_RESTRICTION',
        overrideAction: null,
        overrideReason: null,
        overrideExpiresAt: null,
        sourceSuspicionTier: null,
        sourceRecommendedAction: null,
        createdAt: null,
        updatedAt: null,
      }),
      getStateDetails: async () => null,
      applyModeratorOverride: async () => {
        throw new Error('unused');
      },
    };
    await expect(
      getIntegrityControlledTruth({
        ...base,
        antiCheatStore: validHistory,
        enforcementStore: enforcementWriteFailure,
        moderatorQueueSink: new InMemoryModeratorQueueSink(),
      })
    ).rejects.toMatchObject({ code: 'ENFORCEMENT_UNAVAILABLE' });

    const auditFailure: AntiCheatEventStore = {
      ...validHistory,
      appendEvent: async () => {
        throw new Error('audit unavailable');
      },
    };
    await expect(
      getIntegrityControlledTruth({
        ...base,
        antiCheatStore: auditFailure,
        enforcementStore: validEnforcement,
        moderatorQueueSink: new InMemoryModeratorQueueSink(),
      })
    ).rejects.toMatchObject({ code: 'ANTI_CHEAT_AUDIT_UNAVAILABLE' });

    const queueFailure: ModeratorQueueSink = {
      enqueue: async () => {
        throw new Error('queue unavailable');
      },
    };
    await expect(
      getIntegrityControlledTruth({
        ...base,
        overlap: {
          activeGameFen: START_FEN,
          activeGameMoves: Array.from({ length: 14 }, (_, index) => `m${index}`),
          requestMoves: Array.from({ length: 14 }, (_, index) => `m${index}`),
          repeatedProbeCount: 6,
        },
        antiCheatStore: validHistory,
        enforcementStore: new InMemoryAntiCheatEnforcementStore(),
        moderatorQueueSink: queueFailure,
      })
    ).rejects.toMatchObject({ code: 'MODERATOR_QUEUE_UNAVAILABLE' });
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
