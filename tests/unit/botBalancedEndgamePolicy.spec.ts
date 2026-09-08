import { expect, test } from '@playwright/test';

import { buildBotCandidatesFromFen } from '@/lib/bot/botCandidates';
import { getBotDifficultyProfile } from '@/lib/bot/botDifficulty';
import { assessStaticBotMove } from '@/lib/bot/botMoveSafety';
import type { BotCandidateLine } from '@/lib/bot/botPersonality';
import {
  buildSafeBotShortlist,
  maybeBlunderPick,
  selectBotMoveForStyle,
} from '@/lib/bot/botPersonalityStyle';

function engineLine(
  move: string,
  scoreCp: number,
  rank: number,
  endgameEvidence?: BotCandidateLine['endgameEvidence'],
): BotCandidateLine {
  return {
    move,
    scoreCp,
    engineScoreCp: scoreCp,
    engineRank: rank,
    source: 'engine',
    staticRiskCp: 0,
    allowsForcedMate: false,
    endgameEvidence,
    features: {
      capture: false,
      check: false,
      mate: false,
      promotion: false,
      development: false,
      centerControl: false,
      kingPressure: false,
      movedPieceEnPrise: false,
      opponentReplyCount: 8,
      materialDeltaAfterMoveCp: 0,
    },
  };
}

function endgameEvidence(
  overrides: Partial<NonNullable<BotCandidateLine['endgameEvidence']>> = {},
): NonNullable<BotCandidateLine['endgameEvidence']> {
  return {
    isEndgame: true,
    kingActivityDelta: 0,
    passedPawnAdvance: false,
    promotionPrevention: false,
    favorableSimplification: false,
    materialPreserved: true,
    reasons: ['material-preserved'],
    ...overrides,
  };
}

test.describe('Balanced and Endgame shared safe-shortlist policy', () => {
  test('Balanced remains the neutral Stockfish-order baseline', () => {
    const top = engineLine('e3e4', 35, 1, endgameEvidence());
    const activeKing = engineLine('e3d4', 28, 2, endgameEvidence({
      kingActivityDelta: 1,
      reasons: ['king-activity', 'material-preserved'],
    }));

    expect(selectBotMoveForStyle('balanced', [top, activeKing], 6, 0, () => 0)?.move).toBe('e3e4');
  });

  test('Endgame may choose a near-equal line with stronger endgame evidence', () => {
    const top = engineLine('e3e4', 35, 1, endgameEvidence());
    const activeKing = engineLine('e3d4', 28, 2, endgameEvidence({
      kingActivityDelta: 1,
      reasons: ['king-activity', 'material-preserved'],
    }));

    const selected = selectBotMoveForStyle('endgame', [top, activeKing], 6, 0, () => 0);
    expect(selected?.move).toBe('e3d4');
    expect(selected?.rationale).toBe('engine-safe:endgame-l6');
  });

  test('Endgame requires strictly stronger evidence and accepts the exact Master boundary', () => {
    const top = engineLine('e3e4', 40, 1, endgameEvidence({
      kingActivityDelta: 1,
      reasons: ['king-activity', 'material-preserved'],
    }));
    const equalStrength = engineLine('e3d4', 39, 2, endgameEvidence({
      kingActivityDelta: 1,
      reasons: ['king-activity', 'material-preserved'],
    }));
    const boundary = engineLine('e3f4', 28, 3, endgameEvidence({
      kingActivityDelta: 2,
      reasons: ['king-activity', 'material-preserved'],
    }));

    expect(selectBotMoveForStyle('endgame', [top, equalStrength], 6, 0, () => 0)?.move).toBe('e3e4');
    expect(selectBotMoveForStyle('endgame', [top, equalStrength, boundary], 6, 0, () => 0)?.move).toBe('e3f4');
  });

  test('Endgame inaccuracy cannot pick a stronger displaced engine line', () => {
    const top = engineLine('e3e4', 35, 1, endgameEvidence());
    const activeKing = engineLine('e3d4', 28, 2, endgameEvidence({ kingActivityDelta: 2 }));
    const lessActiveKing = engineLine('e3f4', 25, 3, endgameEvidence({ kingActivityDelta: 1 }));

    expect(selectBotMoveForStyle('endgame', [top, activeKing], 6, 1, () => 0)).toEqual({
      move: 'e3d4', rationale: 'engine-safe:endgame-l6',
    });
    expect(selectBotMoveForStyle('endgame', [top, activeKing, lessActiveKing], 6, 1, () => 0)).toEqual({
      move: 'e3f4', rationale: 'engine-safe:humanized-inaccuracy-l6',
    });
  });

  test('engine inaccuracies exclude equal or unknown scores and respect either evaluation sign', () => {
    for (const score of [30, -30]) {
      const preferred = engineLine('e3d4', score, 2);
      const stronger = engineLine('e3e4', score + 7, 1);
      const equal = engineLine('e3f4', score, 3);
      const unknown = engineLine('e3d3', 0, 4);
      unknown.scoreCp = null;
      unknown.engineScoreCp = null;
      const worse = engineLine('e3f3', score - 3, 5);
      expect(maybeBlunderPick([unknown, worse], 1, () => 0)).toBeNull();
      expect(maybeBlunderPick([preferred, stronger, equal, unknown], 1, () => 0)).toBeNull();
      expect(maybeBlunderPick([preferred, stronger, equal, unknown, worse], 1, () => 0)).toBe(worse);
    }
  });

  test('Endgame ordering cannot displace an available forced mate', () => {
    const mate = engineLine('h5h7', 0, 1, endgameEvidence());
    mate.scoreCp = null;
    mate.engineScoreCp = null;
    mate.features!.check = true;
    mate.features!.mate = true;
    const conversion = engineLine('e6e7', 500, 2, endgameEvidence({
      passedPawnAdvance: true,
      reasons: ['passed-pawn-advance', 'material-preserved'],
    }));

    expect(selectBotMoveForStyle('endgame', [mate, conversion], 3, 1, () => 0.99)?.move).toBe('h5h7');
  });

  test('Endgame falls back to engine order when no endgame-specific phase exists', () => {
    const top = engineLine('g1f3', 24, 1);
    const stylistic = engineLine('e1d2', 22, 2, {
      ...endgameEvidence({ kingActivityDelta: 2, reasons: ['king-activity'] }),
      isEndgame: false,
    });

    expect(selectBotMoveForStyle('endgame', [top, stylistic], 6, 0, () => 0)?.move).toBe('g1f3');
  });

  test('Endgame evidence cannot override the Master centipawn window or safe shortlist', () => {
    const top = engineLine('e3e4', 40, 1, endgameEvidence());
    const tooInferior = engineLine('e3d4', 20, 2, endgameEvidence({
      kingActivityDelta: 2,
      passedPawnAdvance: true,
      reasons: ['king-activity', 'passed-pawn-advance', 'material-preserved'],
    }));
    const unsafe = engineLine('a1a8', 39, 3, endgameEvidence({
      passedPawnAdvance: true,
      reasons: ['passed-pawn-advance'],
    }));
    unsafe.staticRiskCp = 900;
    unsafe.features!.movedPieceEnPrise = true;

    const safeMoves = buildSafeBotShortlist([top, tooInferior, unsafe], 6).map((line) => line.move);
    expect(safeMoves).toEqual(['e3e4', 'e3d4']);
    expect(safeMoves).not.toContain('a1a8');
    expect(selectBotMoveForStyle('endgame', [top, tooInferior, unsafe], 6, 0, () => 0)?.move).toBe('e3e4');
  });

  test('frozen endgames produce deterministic king, pawn, prevention, and simplification evidence', () => {
    const kingActivity = assessStaticBotMove('7k/8/8/8/8/4K3/7P/8 w - - 0 1', 'e3d4');
    const passedPawn = assessStaticBotMove('7k/8/8/4P3/8/8/8/K7 w - - 0 1', 'e5e6');
    const prevention = assessStaticBotMove('7k/8/8/8/8/3K4/4p3/8 w - - 0 1', 'd3e2');
    const simplification = assessStaticBotMove('7k/8/8/8/8/8/7P/Rr5K w - - 0 1', 'a1b1');

    expect(kingActivity?.endgameEvidence).toMatchObject({ isEndgame: true, kingActivityDelta: 1 });
    expect(kingActivity?.endgameEvidence?.reasons).toContain('king-activity');
    expect(passedPawn?.endgameEvidence?.passedPawnAdvance).toBe(true);
    expect(prevention?.endgameEvidence?.promotionPrevention).toBe(true);
    expect(simplification?.endgameEvidence?.favorableSimplification).toBe(true);
  });

  test('ordinary middlegame development is not mislabeled as endgame evidence', () => {
    const line = assessStaticBotMove(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'g8f6',
    );

    expect(line?.endgameEvidence).toMatchObject({ isEndgame: false, reasons: [] });
  });
});

test.describe('production Master/Aggressive closure evidence', () => {
  test('preserves policy evidence for smoke game ea23c2c7', async ({}, testInfo) => {
    test.setTimeout(75_000);
    const profile = getBotDifficultyProfile(6);
    const positions = [
      {
        ply: 2,
        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        selected: 'd7d5',
      },
      {
        ply: 4,
        fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2',
        selected: 'e7e6',
      },
      {
        ply: 6,
        fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq - 1 3',
        selected: 'c7c5',
      },
      {
        ply: 8,
        fen: 'rnbqkbnr/pp3ppp/4p3/2pp4/2PP4/2N2N2/PP2PPPP/R1BQKB1R b KQkq - 1 4',
        selected: 'c5d4',
      },
      {
        ply: 10,
        fen: 'rnbqkbnr/pp3ppp/4p3/3p4/2Pp4/2N1PN2/PP3PPP/R1BQKB1R b KQkq - 0 5',
        selected: 'd4c3',
      },
    ];
    const evidence = [];

    for (const position of positions) {
      const candidates = await buildBotCandidatesFromFen(position.fen, profile, {
        personalityStyle: 'aggressive',
        allowOpeningReference: true,
      });
      const safe = buildSafeBotShortlist(candidates, 6);
      const selected = safe.find((line) => line.move === position.selected);

      expect(selected?.source, `ply ${position.ply}`).toBe('engine');
      expect(selected?.lossFromBestCp ?? 100_000, `ply ${position.ply}`).toBeLessThanOrEqual(30);
      evidence.push({
        ply: position.ply,
        move: position.selected,
        engineRank: selected?.engineRank ?? null,
        lossFromBestCp: selected?.lossFromBestCp ?? null,
        concreteCompensation: selected?.planEvidence?.concreteCompensation ?? null,
        safeShortlist: safe.map((line) => line.move),
      });
    }

    console.log(`PROD_SMOKE_POLICY_EVIDENCE ${JSON.stringify(evidence)}`);
    await testInfo.attach('production-master-aggressive-ea23c2c7-policy-evidence.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  });
});
