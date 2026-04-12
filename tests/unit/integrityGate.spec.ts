import { expect, test } from '@playwright/test';

import {
  createMoveSequenceFingerprint,
  createPositionFingerprint,
  getIntegrityControlledTruth,
  normalizeFenForComparison,
} from '../../lib/analysis/intelligence';

const START_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B5/5N2/PPPPPPPP/RNBQK2R b KQkq - 2 2';

function createStubTruthProvider() {
  let called = false;
  return {
    provider: async () => {
      called = true;
      return {
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
      };
    },
    wasCalled: () => called,
  };
}

test.describe('Integrity gate scaffolding', () => {
  test('position fingerprint ignores halfmove/fullmove counters', async () => {
    const a = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const b = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 34';
    expect(normalizeFenForComparison(a)).toBe(normalizeFenForComparison(b));
    expect(createPositionFingerprint(a)).toBe(createPositionFingerprint(b));
  });

  test('move-sequence fingerprint is deterministic', async () => {
    const seq = ['e4', ' e5 ', 'Nf3'];
    const first = createMoveSequenceFingerprint(seq);
    const second = createMoveSequenceFingerprint(seq);
    expect(first).toBe(second);
  });

  test('blocked rated game never reaches engine', async () => {
    const truthProvider = createStubTruthProvider();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'active-rated-game' },
      truthProvider: truthProvider.provider,
    });

    expect(truthProvider.wasCalled()).toBe(false);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.responseLevel).toBe('BLOCKED');
      expect(res.refusal?.reason).toBe('active-rated-game-protected');
      expect(res.audit.engineCalled).toBe(false);
    }
  });

  test('blocked tournament game never reaches engine', async () => {
    const truthProvider = createStubTruthProvider();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'active-tournament-game' },
      truthProvider: truthProvider.provider,
    });

    expect(truthProvider.wasCalled()).toBe(false);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.responseLevel).toBe('BLOCKED');
      expect(res.refusal?.reason).toBe('active-tournament-game-protected');
      expect(res.audit.engineCalled).toBe(false);
    }
  });

  test('training mode allows engine', async () => {
    const truthProvider = createStubTruthProvider();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      truthProvider: truthProvider.provider,
    });

    expect(truthProvider.wasCalled()).toBe(true);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.responseLevel).toBe('FULL');
      expect(res.audit.engineCalled).toBe(true);
    }
  });

  test('completed-game review allows engine', async () => {
    const truthProvider = createStubTruthProvider();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'completed-game-review' },
      truthProvider: truthProvider.provider,
    });

    expect(truthProvider.wasCalled()).toBe(true);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.responseLevel).toBe('FULL');
      expect(res.audit.engineCalled).toBe(true);
    }
  });

  test('free-play live human vs human is blocked by default', async () => {
    const truthProvider = createStubTruthProvider();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: {
        type: 'active-unrated-free-play-game',
        liveHumanVsHuman: true,
      },
      truthProvider: truthProvider.provider,
    });

    expect(truthProvider.wasCalled()).toBe(false);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.responseLevel).toBe('BLOCKED');
      expect(res.refusal?.reason).toBe('free-play-human-vs-human-consent-required');
      expect(res.audit.engineCalled).toBe(false);
    }
  });

  test('blocked response returns structured refusal payload', async () => {
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'active-rated-game' },
      truthProvider: async () => {
        throw new Error('should-not-be-called');
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal).toEqual({
        code: 'INTEGRITY_BLOCKED',
        reason: 'active-rated-game-protected',
        message: 'Analysis is blocked for the current gameplay context.',
      });
      expect(res.audit).toMatchObject({
        requestContext: { type: 'active-rated-game' },
        policyVerdict: {
          responseLevel: 'BLOCKED',
          refusalReason: 'active-rated-game-protected',
        },
        engineCalled: false,
        responseLevel: 'BLOCKED',
        refusalReason: 'active-rated-game-protected',
        antiCheat: {
          verdict: 'CLEAR',
          protectedContext: true,
          blockedByOverlap: false,
          suspicion: {
            score: 0,
            tier: 'CLEAR',
          },
        },
      });
    }
  });

  test('clear non-overlap request proceeds in allowed context', async () => {
    const truthProvider = createStubTruthProvider();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        activeGameFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        activeGameMoves: ['d4', 'd5'],
        requestMoves: ['e4', 'e5', 'Nf3'],
      },
      truthProvider: truthProvider.provider,
    });

    expect(res.ok).toBe(true);
    expect(truthProvider.wasCalled()).toBe(true);
    if (res.ok) {
      expect(res.audit.antiCheat.verdict).toBe('CLEAR');
      expect(res.audit.antiCheat.blockedByOverlap).toBe(false);
    }
  });

  test('opening overlap returns metadata but does not hard-block by default', async () => {
    const truthProvider = createStubTruthProvider();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3', 'Nc6'],
        requestMoves: ['e4', 'e5', 'Nf3'],
      },
      truthProvider: truthProvider.provider,
    });

    expect(res.ok).toBe(true);
    expect(truthProvider.wasCalled()).toBe(true);
    if (res.ok) {
      expect(res.audit.antiCheat.verdict).toBe('BOOK_OVERLAP');
      expect(res.audit.antiCheat.blockedByOverlap).toBe(false);
      expect(res.audit.antiCheat.suspicion.tier).toBe('CLEAR');
      expect(res.audit.antiCheat.suspicion.score).toBeLessThan(15);
    }
  });

  test('confirmed overlap in protected context blocks engine', async () => {
    const truthProvider = createStubTruthProvider();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: {
        type: 'active-unrated-free-play-game',
        liveHumanVsHuman: false,
        explicitConsentMode: true,
      },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
        requestMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
      },
      truthProvider: truthProvider.provider,
    });

    expect(res.ok).toBe(false);
    expect(truthProvider.wasCalled()).toBe(false);
    if (!res.ok) {
      expect(res.refusal?.reason).toBe('confirmed-overlap-protected-context');
      expect(res.audit.antiCheat.verdict).toBe('CONFIRMED_OVERLAP');
      expect(res.audit.antiCheat.protectedContext).toBe(true);
      expect(res.audit.antiCheat.blockedByOverlap).toBe(true);
      expect(['WARNING', 'SOFT_LOCK_RECOMMENDED', 'ESCALATE_REVIEW']).toContain(
        res.audit.antiCheat.suspicion.tier
      );
    }
  });

  test('isolated low-risk overlap stays low suspicion', async () => {
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3'],
        requestMoves: ['e4', 'e5', 'Nc3'],
        repeatedProbeCount: 1,
      },
      truthProvider: createStubTruthProvider().provider,
      nowEpochMs: 1_700_000_000_000,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(['CLEAR', 'WATCH']).toContain(res.audit.antiCheat.suspicion.tier);
      expect(res.audit.antiCheat.suspicion.score).toBeLessThan(15);
    }
  });

  test('repeated protected-context overlap raises suspicion', async () => {
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: {
        type: 'active-unrated-free-play-game',
        liveHumanVsHuman: false,
        explicitConsentMode: true,
      },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
        requestMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
        signalCounts: {
          confirmedOverlap: 2,
          protectedOverlapAttempt: 3,
        },
      },
      truthProvider: createStubTruthProvider().provider,
      nowEpochMs: 1_700_000_000_000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.audit.antiCheat.suspicion.tier).toBe('ESCALATE_REVIEW');
      expect(res.audit.antiCheat.suspicion.reasons.length).toBeGreaterThan(0);
    }
  });

  test('repeated blocked attempts escalate tier', async () => {
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'active-rated-game' },
      overlap: {
        signalCounts: {
          blockedRequest: 6,
        },
        requestMarker: 'req-42',
      },
      truthProvider: createStubTruthProvider().provider,
      nowEpochMs: 1_700_000_000_000,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(['SOFT_LOCK_RECOMMENDED', 'ESCALATE_REVIEW']).toContain(res.audit.antiCheat.suspicion.tier);
      expect(res.audit.antiCheat.suspicion.reasons.some((r) => r.signal === 'blocked_request_pattern')).toBe(true);
    }
  });

  test('score decay lowers stale risk', async () => {
    const fresh = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        repeatedProbeCount: 6,
        signalCounts: { probingBurst: 6 },
        lastSignalAtEpochMs: 1_700_000_000_000,
      },
      truthProvider: createStubTruthProvider().provider,
      nowEpochMs: 1_700_000_000_000,
    });
    const stale = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        repeatedProbeCount: 6,
        signalCounts: { probingBurst: 6 },
        lastSignalAtEpochMs: 1_700_000_000_000,
      },
      truthProvider: createStubTruthProvider().provider,
      nowEpochMs: 1_700_000_000_000 + 4 * 60 * 60 * 1000,
    });

    expect(fresh.ok).toBe(true);
    expect(stale.ok).toBe(true);
    if (fresh.ok && stale.ok) {
      expect(stale.audit.antiCheat.suspicion.score).toBeLessThan(fresh.audit.antiCheat.suspicion.score);
      expect(stale.audit.antiCheat.suspicion.decayFactor).toBeLessThan(fresh.audit.antiCheat.suspicion.decayFactor);
    }
  });

  test('reason bundle is populated for non-clear suspicion', async () => {
    const nowEpochMs = 1_700_000_000_000;
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: {
        type: 'active-unrated-free-play-game',
        explicitConsentMode: true,
      },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
        requestMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
        requestMarker: 'req-reason-1',
      },
      truthProvider: createStubTruthProvider().provider,
      nowEpochMs,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      const reasons = res.audit.antiCheat.suspicion.reasons;
      expect(reasons.length).toBeGreaterThan(0);
      for (const reason of reasons) {
        expect(reason.signal.length).toBeGreaterThan(0);
        expect(reason.weight).toBeGreaterThan(0);
        expect(reason.timestampEpochMs).toBe(nowEpochMs);
        expect(reason.requestMarker).toBe('req-reason-1');
        expect(reason.overlapVerdict).toBe('CONFIRMED_OVERLAP');
        expect(typeof reason.protectedContext).toBe('boolean');
      }
    }
  });
});
