import { expect, test } from '@playwright/test';
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildBotCandidatesFromFen } from '@/lib/bot/botCandidates';
import { getBotDifficultyProfile } from '@/lib/bot/botDifficulty';
import { assessStaticBotMove } from '@/lib/bot/botMoveSafety';
import { botOpeningReferenceMoves } from '@/lib/bot/botOpeningBook';
import { evaluateTrainerPositionUci } from '@/lib/analysis/engineComputeService';
import type { BotCandidateLine } from '@/lib/bot/botPersonality';
import {
  annotateEngineLossFromBest,
  buildSafeBotShortlist,
  selectBotMoveForStyle,
  type BotPersonalityStyle,
} from '@/lib/bot/botPersonalityStyle';

const BEFORE_NXE4 = 'rnbqkb1r/3ppp1p/p4np1/1p4B1/3PP3/3B1N2/PP3PPP/RN1QK2R b KQkq - 1 7';
const BEFORE_F5 = 'rnbqkb1r/3ppp1p/p5p1/1p4B1/3PB3/5N2/PP3PPP/RN1QK2R b KQkq - 0 8';
const BEFORE_QXD2 = 'Bnb1kb1r/3pp2p/p5p1/qp3p2/3P4/5N2/PP1B1PPP/RN1QK2R b KQk - 2 10';
const AFTER_QXD2 = 'Bnb1kb1r/3pp2p/p5p1/1p3p2/3P4/5N2/PP1q1PPP/RN1QK2R w KQk - 0 11';

function featureLine(
  move: string,
  engineScoreCp: number,
  features: Partial<NonNullable<BotCandidateLine['features']>> = {},
): BotCandidateLine {
  return {
    move,
    scoreCp: engineScoreCp,
    engineScoreCp,
    engineRank: 1,
    source: 'engine',
    staticRiskCp: 0,
    allowsForcedMate: false,
    features: {
      capture: false,
      check: false,
      mate: false,
      promotion: false,
      development: false,
      centerControl: false,
      kingPressure: false,
      movedPieceEnPrise: false,
      opponentReplyCount: 24,
      materialDeltaAfterMoveCp: 0,
      ...features,
    },
  };
}

function withPlan(
  line: BotCandidateLine,
  evidence: Partial<NonNullable<BotCandidateLine['planEvidence']>> = {},
): BotCandidateLine {
  return {
    ...line,
    enginePv: [line.move, 'e2e3', 'g8f6'],
    planEvidence: {
      opponentReply: 'e2e3',
      continuation: 'g8f6',
      observedPlies: 3,
      materialDeltaAfterPvCp: 0,
      concreteCompensation: false,
      sustainedInitiative: true,
      initiativeReasons: ['development-continued'],
      ...evidence,
    },
  };
}

function fenAfter(moves: string[]): string {
  const board = new Chess();
  for (const uci of moves) {
    board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
  }
  return board.fen();
}

test.describe('Aggressive bot shared safe-shortlist policy', () => {
  test('production queen-check blunder is detected by one-reply safety evidence', () => {
    const line = assessStaticBotMove(BEFORE_QXD2, 'a5d2');
    expect(line).not.toBeNull();
    expect(line?.features?.check).toBe(true);
    // Qxd2 wins a bishop before losing the queen, so the net one-reply loss is 570cp.
    expect(line?.staticRiskCp).toBeGreaterThanOrEqual(500);

    const reply = assessStaticBotMove(AFTER_QXD2, 'b1d2');
    expect(reply?.features?.capture).toBe(true);
    expect(reply?.features?.materialDeltaAfterMoveCp).toBeGreaterThanOrEqual(800);
  });

  test('production f-pawn push exposes the rook and is not treated as sound activity', () => {
    const line = assessStaticBotMove(BEFORE_F5, 'f7f5');
    expect(line).not.toBeNull();
    expect(line?.staticRiskCp).toBeGreaterThanOrEqual(500);
  });

  test('engine loss window excludes the production Nxe4 sacrifice', () => {
    const candidates: BotCandidateLine[] = [
      featureLine('c8b7', 25, { development: true }),
      featureLine('f6e4', -230, { capture: true, movedPieceEnPrise: true }),
    ];
    candidates[0]!.engineRank = 1;
    candidates[1]!.engineRank = 2;
    const safe = buildSafeBotShortlist(candidates, 3);
    expect(safe.map((line) => line.move)).toEqual(['c8b7']);
  });

  test('engine rank one remains authoritative for an engine-approved sacrifice', () => {
    const best = featureLine('d8h4', 20, { check: true, movedPieceEnPrise: true });
    best.engineRank = 1;
    best.staticRiskCp = 700;
    const quiet = featureLine('g8f6', 10, { development: true });
    quiet.engineRank = 2;
    quiet.staticRiskCp = 0;

    expect(buildSafeBotShortlist([best, quiet], 6).map((line) => line.move)).toEqual(['d8h4', 'g8f6']);
  });

  test('all-losing engine lines fail open to the least-bad rank-one move', () => {
    const leastBad = featureLine('g8f6', -900, { movedPieceEnPrise: true });
    leastBad.engineRank = 1;
    leastBad.staticRiskCp = 900;
    leastBad.allowsForcedMate = true;
    const worse = featureLine('d8h4', -1_200, { check: true, movedPieceEnPrise: true });
    worse.engineRank = 2;
    worse.staticRiskCp = 1_200;
    worse.allowsForcedMate = true;

    expect(buildSafeBotShortlist([leastBad, worse], 6).map((line) => line.move)).toEqual(['g8f6']);
    expect(selectBotMoveForStyle('aggressive', [leastBad, worse], 6, 1, () => 0)?.move).toBe('g8f6');
  });

  test('humanized inaccuracy cannot discard an available forced mate', () => {
    const mate = featureLine('h5h7', 0, { check: true, mate: true });
    mate.scoreCp = null;
    mate.engineScoreCp = null;
    mate.engineRank = 1;
    const alternative = featureLine('h5e5', 250, { check: true });
    alternative.engineRank = 2;

    expect(selectBotMoveForStyle('aggressive', [mate, alternative], 3, 1, () => 0)?.move).toBe('h5h7');
  });

  test('Aggressive selects an alternate only when a near-equal PV proves a stronger plan', () => {
    const quiet = featureLine('g8f6', 40, { development: true, centerControl: true });
    quiet.engineRank = 1;
    const forcing = withPlan(featureLine('d8a5', 35, {
      check: true,
      kingPressure: true,
      opponentReplyCount: 4,
    }), {
      initiativeReasons: ['king-pressure-sustained'],
    });
    forcing.engineRank = 2;
    const candidates = [quiet, forcing];

    expect(selectBotMoveForStyle('balanced', candidates, 3, 0, () => 0)?.move).toBe('g8f6');
    expect(selectBotMoveForStyle('aggressive', candidates, 3, 0, () => 0)?.move).toBe('d8a5');
  });

  test('Master keeps rank one when an alternate only looks aggressive on the first move', () => {
    const best = featureLine('g8f6', 30, { development: true });
    best.engineRank = 1;
    const flashy = featureLine('d8h4', 29, {
      check: true,
      capture: true,
      kingPressure: true,
      opponentReplyCount: 2,
    });
    flashy.engineRank = 2;
    flashy.openingReference = true;

    const pick = selectBotMoveForStyle('aggressive', [best, flashy], 6, 0, () => 0);
    expect(pick?.move).toBe('g8f6');
    expect(pick?.rationale).toContain('top-line');
  });

  test('Master may depart from rank one only for a nearly equal PV-proven continuation', () => {
    const best = featureLine('g8f6', 30, { development: true });
    best.engineRank = 1;
    const planned = withPlan(featureLine('d7d5', 20, { centerControl: true }));
    planned.engineRank = 2;

    const pick = selectBotMoveForStyle('aggressive', [best, planned], 6, 0, () => 0);
    expect(pick?.move).toBe('d7d5');
    expect(pick?.rationale).toContain('pv-plan');
  });

  test('zero material return is not concrete compensation merely because the root move has static risk', async () => {
    const fen = 'r1b1kb1r/pp3p1p/4pp2/2n5/2P4B/4P3/PP1K2PP/R4BNR b kq - 0 12';
    const candidates = await buildBotCandidatesFromFen(fen, getBotDifficultyProfile(6), {
      personalityStyle: 'aggressive',
      evaluatePosition: async () => ({
        bestMove: 'f6f5',
        lines: [
          { rank: 1, move: 'f6f5', scoreCp: 132, pv: ['f6f5', 'f1e2', 'c5e4'] },
          { rank: 2, move: 'b7b6', scoreCp: 129, pv: ['b7b6', 'g1e2', 'c5e4'] },
        ],
      }),
    });

    const b6 = candidates.find((line) => line.move === 'b7b6');
    expect(b6?.staticRiskCp).toBeGreaterThan(0);
    expect(b6?.planEvidence?.materialDeltaAfterPvCp).toBe(0);
    expect(b6?.planEvidence?.concreteCompensation).toBe(false);
    expect(selectBotMoveForStyle('aggressive', candidates, 6, 0, () => 0)?.move).toBe('f6f5');
  });

  test('calculated loss from best remains available to smoke evidence export', () => {
    const best = featureLine('g8f6', 132);
    best.engineRank = 1;
    const second = featureLine('b7b6', 129);
    second.engineRank = 2;
    const third = featureLine('c5e4', 124);
    third.engineRank = 3;

    expect(annotateEngineLossFromBest([best, second, third]).map((line) => line.lossFromBestCp)).toEqual([0, 3, 8]);
  });

  test('Master rejects a PV-proven alternate outside the 12cp equality window', () => {
    const best = featureLine('g8f6', 30, { development: true });
    best.engineRank = 1;
    const planned = withPlan(featureLine('d7d5', 17, { centerControl: true }));
    planned.engineRank = 2;

    expect(selectBotMoveForStyle('aggressive', [best, planned], 6, 0, () => 0)?.move).toBe('g8f6');
  });

  test('opening reference guides a tie but cannot make a line eligible', () => {
    const best = featureLine('g8f6', 30, { development: true });
    best.engineRank = 1;
    const bookOnly = featureLine('d7d5', 29, { centerControl: true });
    bookOnly.engineRank = 2;
    bookOnly.openingReference = true;

    expect(selectBotMoveForStyle('aggressive', [best, bookOnly], 6, 0, () => 0)?.move).toBe('g8f6');
  });

  test('humanized inaccuracy cannot promote an unproven aggressive alternative', () => {
    const best = featureLine('g8f6', 30, { development: true });
    best.engineRank = 1;
    const safeSecond = featureLine('d7d5', -20, { centerControl: true });
    safeSecond.engineRank = 2;
    const unsafe = featureLine('d8d2', -500, { check: true, movedPieceEnPrise: true });
    unsafe.engineRank = 3;
    const pick = selectBotMoveForStyle('aggressive', [best, safeSecond, unsafe], 3, 1, () => 0);
    expect(pick?.move).toBe('g8f6');
  });

  test('engine failure is a deterministic conservative fallback, not raw capture preference', async () => {
    const candidates = await buildBotCandidatesFromFen(BEFORE_QXD2, getBotDifficultyProfile(3), {
      personalityStyle: 'aggressive',
      allowOpeningReference: true,
      evaluatePosition: async () => {
        throw new Error('synthetic_engine_timeout');
      },
    });
    expect(candidates.every((line) => line.source === 'static-fallback')).toBe(true);
    const pick = selectBotMoveForStyle('aggressive', candidates, 3, 0, () => 0);
    expect(pick?.rationale).toContain('static-fallback');
    expect(pick?.move).not.toBe('a5d2');
  });

  test('all personalities choose from the same safe candidate set', () => {
    const safeA = featureLine('g8f6', 30, { development: true });
    safeA.engineRank = 1;
    const safeB = featureLine('d7d5', -20, { centerControl: true });
    safeB.engineRank = 2;
    const unsafe = featureLine('d8d2', -500, { check: true });
    unsafe.engineRank = 3;
    const allowed = new Set(['g8f6', 'd7d5']);
    const styles: BotPersonalityStyle[] = ['balanced', 'aggressive', 'defensive', 'trap', 'endgame', 'chaos'];
    for (const style of styles) {
      const pick = selectBotMoveForStyle(style, [safeA, safeB, unsafe], 3, 0, () => 0);
      expect(allowed.has(pick?.move ?? '')).toBe(true);
    }
  });
});

test.describe('Aggressive 1.d4 server-only opening reference', () => {
  test('covers active sound responses across frozen d4 families', () => {
    expect(botOpeningReferenceMoves(fenAfter(['d2d4']), 'aggressive')).toEqual(['g8f6', 'd7d5']);
    expect(botOpeningReferenceMoves(fenAfter(['d2d4', 'g8f6', 'c2c4']), 'aggressive')).toEqual(['g7g6', 'e7e6']);
    expect(botOpeningReferenceMoves(fenAfter(['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3']), 'aggressive')).toEqual(['f8b4']);
    expect(botOpeningReferenceMoves(fenAfter(['d2d4', 'd7d5', 'c2c4']), 'aggressive')).toEqual(['e7e6', 'c7c6']);
  });

  test('does not provide an Aggressive reference to other personalities or 1.e4', () => {
    const d4 = fenAfter(['d2d4']);
    expect(botOpeningReferenceMoves(d4, 'balanced')).toEqual([]);
    expect(botOpeningReferenceMoves(fenAfter(['e2e4']), 'aggressive')).toEqual([]);
  });

  test('book marks only engine-approved candidates and cannot insert an unsafe move', async () => {
    const fen = fenAfter(['d2d4']);
    const candidates = await buildBotCandidatesFromFen(fen, getBotDifficultyProfile(3), {
      personalityStyle: 'aggressive',
      allowOpeningReference: true,
      evaluatePosition: async () => ({
        bestMove: 'g8f6',
        lines: [
          { rank: 1, move: 'g8f6', scoreCp: 30 },
          { rank: 2, move: 'e7e6', scoreCp: 5 },
        ],
      }),
    });
    expect(candidates.map((line) => line.move)).toEqual(['g8f6', 'e7e6']);
    expect(candidates.find((line) => line.move === 'g8f6')?.openingReference).toBe(true);
    expect(candidates.some((line) => line.move === 'd7d5')).toBe(false);
  });

  test('opening reference is wired only through the authenticated bot-game commit path', () => {
    const commit = readFileSync(join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'), 'utf8');
    expect(commit).toContain('allowOpeningReference: true');
    expect(commit).toContain('pre.botConfig.accl_bot_v1.personalityStyle');

    const start = readFileSync(join(process.cwd(), 'app', 'api', 'bot', 'game', 'start', 'route.ts'), 'utf8');
    expect(start).toContain("source_type");
    expect(start).toContain('resolveAuthenticatedUser');
  });
});

test.describe('Club engine integration', () => {
  test('parallel trainer evaluations cleanly initialize and remain reusable', async () => {
    test.setTimeout(35_000);
    const uncaughtBefore = process.listenerCount('uncaughtException');
    const rejectionBefore = process.listenerCount('unhandledRejection');
    const positions = [fenAfter(['d2d4']), fenAfter(['e2e4']), BEFORE_NXE4];
    const parallel = await Promise.all(positions.map((fen) => evaluateTrainerPositionUci(fen, {
      depth: 6,
      multiPv: 1,
      timeoutMs: 10_000,
    })));
    expect(parallel.every((result) => result.bestMove && result.lines.length > 0)).toBe(true);
    const followup = await evaluateTrainerPositionUci(BEFORE_QXD2, {
      depth: 6,
      multiPv: 1,
      timeoutMs: 10_000,
    });
    expect(followup.bestMove).toBeTruthy();
    expect(process.listenerCount('uncaughtException')).toBe(uncaughtBefore);
    expect(process.listenerCount('unhandledRejection')).toBe(rejectionBefore);
  });

  test('a full smoke-length sequence does not accumulate Stockfish process listeners', async () => {
    test.setTimeout(60_000);
    const uncaughtBefore = process.listenerCount('uncaughtException');
    const rejectionBefore = process.listenerCount('unhandledRejection');
    const fen = fenAfter(['e2e4']);

    for (let index = 0; index < 14; index += 1) {
      const result = await evaluateTrainerPositionUci(fen, {
        depth: 6,
        multiPv: 1,
        timeoutMs: 10_000,
      });
      expect(result.bestMove).toBeTruthy();
      expect(process.listenerCount('uncaughtException')).toBe(uncaughtBefore);
      expect(process.listenerCount('unhandledRejection')).toBe(rejectionBefore);
    }
  });

  test('Club is engine-backed and rejects the real-game Nxe4 regression', async () => {
    test.setTimeout(25_000);
    const profile = getBotDifficultyProfile(3);
    expect(profile.useEngine).toBe(true);
    const candidates = await buildBotCandidatesFromFen(BEFORE_NXE4, profile, {
      personalityStyle: 'aggressive',
      allowOpeningReference: true,
    });
    expect(candidates.some((line) => line.source === 'engine')).toBe(true);
    expect(buildSafeBotShortlist(candidates, 3).map((line) => line.move)).not.toContain('f6e4');
  });

  test('Aggressive stays legal and engine-safe across frozen openings and tactics', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const profile = getBotDifficultyProfile(3);
    const positions = [
      { name: 'd4-start', fen: fenAfter(['d2d4']), rejected: null },
      { name: 'kings-indian-branch', fen: fenAfter(['d2d4', 'g8f6', 'c2c4']), rejected: null },
      { name: 'qgd-slav-branch', fen: fenAfter(['d2d4', 'd7d5', 'c2c4']), rejected: null },
      { name: 'production-nxe4', fen: BEFORE_NXE4, rejected: 'f6e4' },
      { name: 'production-f5', fen: BEFORE_F5, rejected: 'f7f5' },
      { name: 'production-qxd2', fen: BEFORE_QXD2, rejected: 'a5d2' },
    ];
    const evidence: Array<{ name: string; selected: string; elapsedMs: number; candidates: string[] }> = [];

    for (const position of positions) {
      const started = Date.now();
      let engineFailure: unknown = null;
      const candidates = await buildBotCandidatesFromFen(position.fen, profile, {
        personalityStyle: 'aggressive',
        allowOpeningReference: true,
        onEngineFailure: (error) => {
          engineFailure = error;
        },
      });
      const selected = selectBotMoveForStyle('aggressive', candidates, 3, 0, () => 0);
      const elapsedMs = Date.now() - started;
      expect(
        candidates.some((line) => line.source === 'engine'),
        `${position.name}: ${String((engineFailure as Error | null)?.message ?? engineFailure ?? 'no error')}`,
      ).toBe(true);
      expect(selected?.rationale, position.name).toContain('engine-safe');
      expect(selected?.move).not.toBe(position.rejected);
      const board = new Chess(position.fen);
      expect(() => board.move({
        from: selected!.move.slice(0, 2),
        to: selected!.move.slice(2, 4),
        promotion: (selected!.move[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
      })).not.toThrow();
      expect(elapsedMs).toBeLessThan(profile.engineTimeoutMs + 2_000);
      evidence.push({
        name: position.name,
        selected: selected!.move,
        elapsedMs,
        candidates: candidates.map((line) => line.move),
      });
    }

    await testInfo.attach('aggressive-club-frozen-benchmark.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  });
});

test.describe('Master engine regression: cb6ab0e5-f0af-4d9b-80b6-fbddf1a8b850', () => {
  test('rejects all four production blunders across one warm engine process', async ({}, testInfo) => {
    test.setTimeout(75_000);
    const profile = getBotDifficultyProfile(6);
    expect(profile.label).toBe('Master');
    expect(profile.useEngine).toBe(true);

    const positions = [
      {
        name: 'rook-for-pawn-a8a2',
        fen: fenAfter(['c2c4', 'a7a6', 'b1c3', 'b7b5', 'c4b5', 'a6b5', 'c3b5']),
        rejected: 'a8a2',
      },
      {
        name: 'queen-for-knight-d8c7',
        fen: fenAfter([
          'c2c4', 'a7a6', 'b1c3', 'b7b5', 'c4b5', 'a6b5', 'c3b5', 'a8a2',
          'a1a2', 'g8f6', 'd2d3', 'b8c6', 'c1f4', 'e7e6', 'b5c7',
        ]),
        rejected: 'd8c7',
      },
      {
        name: 'knight-for-pawn-f6e4',
        fen: fenAfter([
          'c2c4', 'a7a6', 'b1c3', 'b7b5', 'c4b5', 'a6b5', 'c3b5', 'a8a2',
          'a1a2', 'g8f6', 'd2d3', 'b8c6', 'c1f4', 'e7e6', 'b5c7', 'd8c7',
          'f4c7', 'f8b4', 'd1d2', 'b4d2', 'e1d2',
        ]),
        rejected: 'f6e4',
      },
      {
        name: 'second-knight-for-pawn-c6e5',
        fen: fenAfter([
          'c2c4', 'a7a6', 'b1c3', 'b7b5', 'c4b5', 'a6b5', 'c3b5', 'a8a2',
          'a1a2', 'g8f6', 'd2d3', 'b8c6', 'c1f4', 'e7e6', 'b5c7', 'd8c7',
          'f4c7', 'f8b4', 'd1d2', 'b4d2', 'e1d2', 'f6e4', 'd3e4',
        ]),
        rejected: 'c6e5',
      },
    ];
    const evidence: Array<{
      name: string;
      rejected: string;
      selected: string;
      elapsedMs: number;
      safeShortlist: string[];
    }> = [];

    for (const position of positions) {
      const started = Date.now();
      let engineFailure: unknown = null;
      const candidates = await buildBotCandidatesFromFen(position.fen, profile, {
        personalityStyle: 'aggressive',
        allowOpeningReference: true,
        onEngineFailure: (error) => {
          engineFailure = error;
        },
      });
      const safeShortlist = buildSafeBotShortlist(candidates, 6);
      const selected = selectBotMoveForStyle('aggressive', candidates, 6, 0, () => 0);
      const elapsedMs = Date.now() - started;

      expect(
        candidates.some((line) => line.source === 'engine'),
        `${position.name}: ${String((engineFailure as Error | null)?.message ?? engineFailure ?? 'no error')}`,
      ).toBe(true);
      expect(safeShortlist.map((line) => line.move), position.name).not.toContain(position.rejected);
      expect(selected?.rationale, position.name).toContain('engine-safe');
      expect(selected?.move, position.name).not.toBe(position.rejected);
      expect(elapsedMs, position.name).toBeLessThan(profile.engineTimeoutMs + 2_000);

      evidence.push({
        name: position.name,
        rejected: position.rejected,
        selected: selected!.move,
        elapsedMs,
        safeShortlist: safeShortlist.map((line) => line.move),
      });
    }

    await testInfo.attach('master-aggressive-cb6ab0e5-regression.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  });
});

test.describe('manual Master/Aggressive opening-to-middlegame audition', () => {
  test('plays a frozen 1.d4 trial against a Strong balanced opponent', async ({}, testInfo) => {
    test.skip(
      process.env.RUN_AGGRESSIVE_GAME_AUDITION !== '1',
      'Manual local evidence run; excluded from standing CI cost.',
    );
    test.setTimeout(180_000);

    const board = new Chess();
    const master = getBotDifficultyProfile(6);
    const opponent = getBotDifficultyProfile(4);
    const records: Array<{
      ply: number;
      side: 'white' | 'black';
      san: string;
      uci: string;
      rationale: string;
      engineRank: number | null;
      lossFromBestCp: number | null;
      staticRiskCp: number | null;
      referenceOptions: readonly string[];
      openingReference: boolean;
      active: boolean;
      activeReasons: string[];
    }> = [];
    const scriptedWhite = ['d2d4', 'c2c4', 'b1c3'];

    while (!board.isGameOver() && board.history().length < 40) {
      const side = board.turn() === 'w' ? 'white' : 'black';
      const fen = board.fen();
      const scripted = side === 'white' ? scriptedWhite[Math.floor(board.history().length / 2)] : undefined;
      let uci: string;
      let rationale: string;
      let selectedLine: BotCandidateLine | undefined;
      let referenceOptions: readonly string[] = [];

      if (scripted && board.moves({ verbose: true }).some((move) => `${move.from}${move.to}` === scripted)) {
        uci = scripted;
        rationale = 'frozen-opening-opponent';
      } else {
        const profile = side === 'black' ? master : opponent;
        const style: BotPersonalityStyle = side === 'black' ? 'aggressive' : 'balanced';
        referenceOptions = side === 'black' ? botOpeningReferenceMoves(fen, style) : [];
        const candidates = await buildBotCandidatesFromFen(fen, profile, {
          personalityStyle: style,
          allowOpeningReference: side === 'black',
        });
        const safe = buildSafeBotShortlist(candidates, profile.level);
        const selected = selectBotMoveForStyle(style, candidates, profile.level, 0, () => 1);
        expect(selected, `${side} ply ${board.history().length + 1}`).not.toBeNull();
        expect(safe.map((line) => line.move), `${side} safe shortlist`).toContain(selected!.move);
        uci = selected!.move;
        rationale = selected!.rationale;
        selectedLine = safe.find((line) => line.move === uci);

        if (side === 'black') {
          expect(selectedLine?.source, `black ${uci}`).toBe('engine');
          if ((selectedLine?.staticRiskCp ?? 0) > 350) {
            expect(selectedLine?.features?.movedPieceEnPrise, `black ${uci}`).toBe(false);
          }
          expect(selectedLine?.lossFromBestCp ?? 100_000, `black ${uci}`).toBeLessThanOrEqual(30);
        }
      }

      const moved = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
      });
      const features = selectedLine?.features;
      const activeReasons = [
        features?.check ? 'check' : null,
        features?.capture ? 'capture' : null,
        features?.development ? 'development' : null,
        features?.centerControl ? 'center-control' : null,
        features?.kingPressure ? 'king-pressure' : null,
        selectedLine?.openingReference ? 'opening-reference' : null,
        moved.san.includes('O-O') ? 'king-safety' : null,
      ].filter((reason): reason is string => Boolean(reason));

      records.push({
        ply: records.length + 1,
        side,
        san: moved.san,
        uci,
        rationale,
        engineRank: selectedLine?.engineRank ?? null,
        lossFromBestCp: selectedLine?.lossFromBestCp ?? null,
        staticRiskCp: selectedLine?.staticRiskCp ?? null,
        referenceOptions,
        openingReference: selectedLine?.openingReference ?? false,
        active: activeReasons.length > 0,
        activeReasons,
      });
    }

    const blackMoves = records.filter((record) => record.side === 'black');
    const referenceOpportunities = blackMoves.filter((record) => record.referenceOptions.length > 0);
    const report = {
      format: 'Master/Aggressive Black vs Strong/Balanced White',
      limit: '20 full moves or terminal position',
      result: board.isCheckmate() ? (board.turn() === 'w' ? '0-1' : '1-0') : board.isDraw() ? '1/2-1/2' : '*',
      pgn: board.pgn(),
      finalFen: board.fen(),
      blackMoves: blackMoves.length,
      activeBlackMoves: blackMoves.filter((record) => record.active).length,
      passiveBlackMoves: blackMoves.filter((record) => !record.active).map((record) => record.san),
      recklessBlackMoves: blackMoves
        .filter((record) => (record.lossFromBestCp ?? 0) > 30)
        .map((record) => record.san),
      referenceOpportunities: referenceOpportunities.length,
      referenceSelections: referenceOpportunities.filter((record) => record.openingReference).length,
      blackMoveEvidence: blackMoves,
    };

    expect(report.recklessBlackMoves).toEqual([]);
    expect(report.referenceOpportunities).toBeGreaterThan(0);
    console.log(`AGGRESSIVE_GAME_AUDITION ${JSON.stringify(report)}`);
    await testInfo.attach('master-aggressive-d4-trial.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });
});
