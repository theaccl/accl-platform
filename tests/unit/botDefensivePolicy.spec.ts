import { expect, test } from '@playwright/test';

import { assessStaticBotMove } from '@/lib/bot/botMoveSafety';
import type { BotCandidateLine } from '@/lib/bot/botPersonality';
import {
  buildSafeBotShortlist,
  selectBotMoveForStyle,
} from '@/lib/bot/botPersonalityStyle';

function defensiveLine(
  move: string,
  scoreCp: number,
  rank: number,
  evidence: Partial<NonNullable<BotCandidateLine['defensiveEvidence']>> = {},
): BotCandidateLine {
  return {
    move,
    scoreCp,
    engineScoreCp: scoreCp,
    engineRank: rank,
    source: 'engine',
    staticRiskCp: 0,
    allowsForcedMate: false,
    defensiveEvidence: {
      observedReplies: 20,
      checkingReplies: 0,
      winningCaptureReplies: 0,
      soundExchange: false,
      safeDevelopment: false,
      materialPreserved: true,
      reasons: ['no-checking-reply', 'no-winning-capture-reply', 'material-preserved'],
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

test.describe('Defensive shared safe-shortlist policy', () => {
  test('chooses a near-equal line that concretely reduces forcing replies', () => {
    const top = defensiveLine('g8f6', 40, 1, {
      checkingReplies: 2,
      winningCaptureReplies: 1,
      reasons: ['material-preserved'],
    });
    const stabilizing = defensiveLine('f8e7', 33, 2, {
      safeDevelopment: true,
      reasons: ['no-checking-reply', 'no-winning-capture-reply', 'safe-development', 'material-preserved'],
    });

    expect(selectBotMoveForStyle('balanced', [top, stabilizing], 6, 0, () => 0)?.move).toBe('g8f6');
    expect(selectBotMoveForStyle('defensive', [top, stabilizing], 6, 0, () => 0)?.move).toBe('f8e7');
  });

  test('does not retreat or distort engine order without stronger reply evidence', () => {
    const top = defensiveLine('g8f6', 40, 1);
    const retreat = defensiveLine('f6g8', 39, 2);

    expect(selectBotMoveForStyle('defensive', [top, retreat], 6, 0, () => 0)?.move).toBe('g8f6');
  });

  test('cannot promote an inferior-looking defense outside the Master window', () => {
    const top = defensiveLine('g8f6', 40, 1, { checkingReplies: 3, winningCaptureReplies: 2 });
    const tooInferior = defensiveLine('f8e7', 27, 2, {
      safeDevelopment: true,
      soundExchange: true,
    });
    const unsafe = defensiveLine('d8d2', 39, 3, { soundExchange: true });
    unsafe.staticRiskCp = 900;
    unsafe.features!.movedPieceEnPrise = true;

    const safe = buildSafeBotShortlist([top, tooInferior, unsafe], 6);
    expect(safe.map((line) => line.move)).toEqual(['g8f6', 'f8e7']);
    expect(selectBotMoveForStyle('defensive', [top, tooInferior, unsafe], 6, 0, () => 0)?.move).toBe('g8f6');
  });

  test('forced mate remains authoritative before Defensive ordering', () => {
    const mate = defensiveLine('h5h7', 0, 1);
    mate.scoreCp = null;
    mate.engineScoreCp = null;
    mate.features!.check = true;
    mate.features!.mate = true;
    const quiet = defensiveLine('h5e5', 200, 2, {
      safeDevelopment: true,
      soundExchange: true,
    });

    expect(selectBotMoveForStyle('defensive', [mate, quiet], 3, 1, () => 0.99)?.move).toBe('h5h7');
  });

  test('frozen positions expose sound development, exchange, and reckless-check controls', () => {
    const development = assessStaticBotMove(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'g8f6',
    );
    const exchange = assessStaticBotMove('7k/8/8/8/8/8/7P/Rr5K w - - 0 1', 'a1b1');
    const recklessCheck = assessStaticBotMove(
      'Bnb1kb1r/3pp2p/p5p1/qp3p2/3P4/5N2/PP1B1PPP/RN1QK2R b KQk - 2 10',
      'a5d2',
    );

    expect(development?.defensiveEvidence?.safeDevelopment).toBe(true);
    expect(exchange?.defensiveEvidence?.soundExchange).toBe(true);
    expect(recklessCheck?.defensiveEvidence?.materialPreserved).toBe(false);
    expect(recklessCheck?.defensiveEvidence?.winningCaptureReplies).toBeGreaterThan(0);
  });

  test('engine-degraded Defensive play stays on deterministic safe fallback order', () => {
    const top = assessStaticBotMove(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'g8f6',
    );
    const alternative = assessStaticBotMove(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'b8c6',
    );

    expect(top).not.toBeNull();
    expect(alternative).not.toBeNull();
    const selected = selectBotMoveForStyle('defensive', [top!, alternative!], 3, 0, () => 0);
    expect(selected?.move).toBe(buildSafeBotShortlist([top!, alternative!], 3)[0]?.move);
  });
});
