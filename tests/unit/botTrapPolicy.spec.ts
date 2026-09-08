import { expect, test } from '@playwright/test';

import { buildBotCandidatesFromFen } from '@/lib/bot/botCandidates';
import { getBotDifficultyProfile } from '@/lib/bot/botDifficulty';
import type { BotCandidateLine } from '@/lib/bot/botPersonality';
import {
  buildSafeBotShortlist,
  selectBotMoveForStyle,
} from '@/lib/bot/botPersonalityStyle';

function trapLine(
  move: string,
  scoreCp: number,
  rank: number,
  evidence: Partial<NonNullable<BotCandidateLine['trapEvidence']>> = {},
): BotCandidateLine {
  return {
    move,
    scoreCp,
    engineScoreCp: scoreCp,
    engineRank: rank,
    source: 'engine',
    staticRiskCp: 0,
    allowsForcedMate: false,
    trapEvidence: {
      opponentReply: 'a7a6',
      continuation: 'b5c6',
      observedPlies: 3,
      materialDeltaAfterPvCp: 0,
      tacticalGain: false,
      forcingContinuation: false,
      sustainedKingPressure: false,
      materialPreserved: true,
      reasons: ['material-preserved'],
      ...evidence,
    },
    features: {
      capture: false,
      check: false,
      mate: false,
      promotion: false,
      development: false,
      centerControl: false,
      kingPressure: false,
      movedPieceEnPrise: false,
      opponentReplyCount: 20,
      materialDeltaAfterMoveCp: 0,
    },
  };
}

test.describe('Trap shared safe-shortlist policy', () => {
  test('may choose a near-equal line with a concrete gain through the best reply', () => {
    const top = trapLine('g8f6', 40, 1);
    const trap = trapLine('d8a5', 33, 2, {
      materialDeltaAfterPvCp: 100,
      tacticalGain: true,
      forcingContinuation: true,
      reasons: ['tactical-gain-after-best-reply', 'forcing-continuation', 'material-preserved'],
    });

    expect(selectBotMoveForStyle('balanced', [top, trap], 6, 0, () => 0)?.move).toBe('g8f6');
    expect(selectBotMoveForStyle('trap', [top, trap], 6, 0, () => 0)).toMatchObject({
      move: 'd8a5',
      rationale: 'engine-safe:trap-pv-plan-l6',
    });
  });

  test('does not reward a check or restricted reply count by itself', () => {
    const top = trapLine('g8f6', 40, 1);
    const superficial = trapLine('d8a5', 39, 2);
    superficial.features!.check = true;
    superficial.features!.kingPressure = true;
    superficial.features!.opponentReplyCount = 2;

    expect(selectBotMoveForStyle('trap', [top, superficial], 6, 0, () => 0)?.move).toBe('g8f6');
  });

  test('requires the full best-reply continuation and preserved material', () => {
    const top = trapLine('g8f6', 40, 1);
    const incomplete = trapLine('d8a5', 39, 2, {
      observedPlies: 2,
      continuation: null,
      tacticalGain: true,
    });
    const reckless = trapLine('d8d2', 39, 3, {
      tacticalGain: true,
      materialPreserved: false,
    });
    reckless.staticRiskCp = 900;
    reckless.features!.movedPieceEnPrise = true;

    expect(buildSafeBotShortlist([top, incomplete, reckless], 6).map((line) => line.move)).toEqual([
      'g8f6',
      'd8a5',
    ]);
    expect(selectBotMoveForStyle('trap', [top, incomplete, reckless], 6, 0, () => 0)?.move).toBe('g8f6');
  });

  test('cannot promote a proven trap outside the Master equality window', () => {
    const top = trapLine('g8f6', 40, 1);
    const tooInferior = trapLine('d8a5', 27, 2, {
      tacticalGain: true,
      forcingContinuation: true,
    });

    expect(selectBotMoveForStyle('trap', [top, tooInferior], 6, 0, () => 0)?.move).toBe('g8f6');
  });

  test('forced mate remains authoritative before Trap ordering and inaccuracy', () => {
    const mate = trapLine('h5h7', 0, 1);
    mate.scoreCp = null;
    mate.engineScoreCp = null;
    mate.features!.check = true;
    mate.features!.mate = true;
    const trap = trapLine('h5e5', 200, 2, {
      tacticalGain: true,
      forcingContinuation: true,
    });

    expect(selectBotMoveForStyle('trap', [mate, trap], 3, 1, () => 0.99)?.move).toBe('h5h7');
  });

  test('engine-degraded Trap play remains on deterministic safe fallback order', () => {
    const first = trapLine('g8f6', 40, 1);
    const second = trapLine('b8c6', 39, 2, { tacticalGain: true });
    first.source = 'static-fallback';
    first.engineRank = null;
    second.source = 'static-fallback';
    second.engineRank = null;

    expect(selectBotMoveForStyle('trap', [first, second], 3, 0, () => 0)?.move).toBe(
      buildSafeBotShortlist([first, second], 3)[0]?.move,
    );
  });

  for (const level of [1, 2, 3, 6] as const) {
    test(`level ${level} fallback retains safe inaccuracies at its configured probability`, async () => {
      const profile = getBotDifficultyProfile(level);
      const candidates = await buildBotCandidatesFromFen(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        profile,
        {
          personalityStyle: 'trap',
          evaluatePosition: async () => { throw new Error('simulated engine outage'); },
        },
      );
      expect(candidates.every((line) => line.source === 'static-fallback')).toBe(true);
      const unsafe = { ...candidates[0], move: 'a1a8', staticRiskCp: 900 };
      const lines = [...candidates, unsafe];
      const safe = buildSafeBotShortlist(lines, level);
      expect(safe.length).toBeGreaterThan(1);
      expect(safe.some((line) => line.move === unsafe.move)).toBe(false);

      // At the probability boundary, no inaccuracy occurs and the neutral
      // deterministic fallback remains authoritative.
      expect(selectBotMoveForStyle('trap', lines, level, profile.blunderProbability,
        () => profile.blunderProbability)?.move).toBe(safe[0].move);

      // Every retained alternative is reachable when an inaccuracy is drawn;
      // an unsafe candidate must never re-enter that selection pool.
      for (let index = 1; index < safe.length; index += 1) {
        const draws = [profile.blunderProbability / 2, (index - 0.5) / (safe.length - 1)];
        const selected = selectBotMoveForStyle('trap', lines, level, profile.blunderProbability,
          () => draws.shift() ?? 0);
        expect(selected).toEqual({
          move: safe[index].move,
          rationale: `static-fallback:humanized-inaccuracy-l${level}`,
        });
      }
    });
  }

  test('fallback forced mate precedes the restored inaccuracy pool', () => {
    const mate = trapLine('h5h7', 40, 1);
    const quiet = trapLine('h5e5', 39, 2);
    for (const line of [mate, quiet]) {
      line.source = 'static-fallback';
      line.engineRank = null;
      line.engineScoreCp = null;
    }
    mate.features!.mate = true;
    expect(selectBotMoveForStyle('trap', [mate, quiet], 1, 1, () => 0)).toEqual({
      move: 'h5h7',
      rationale: 'static-fallback:forced-mate-l1',
    });
  });

  test('candidate construction records three-ply best-reply evidence', async () => {
    const candidates = await buildBotCandidatesFromFen(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      getBotDifficultyProfile(6),
      {
        personalityStyle: 'trap',
        evaluatePosition: async () => ({
          bestMove: 'e2e4',
          lines: [
            { rank: 1, move: 'e2e4', scoreCp: 24, pv: ['e2e4', 'e7e5', 'g1f3'] },
          ],
        }),
      },
    );

    expect(candidates[0]?.trapEvidence).toMatchObject({
      opponentReply: 'e7e5',
      continuation: 'g1f3',
      observedPlies: 3,
      tacticalGain: false,
      materialPreserved: true,
    });
  });
});
