import { expect, test } from '@playwright/test';
import { Chess } from 'chess.js';

import { uciFromVerboseMove, buildBotCandidatesFromFen } from '@/lib/bot/botCandidates';
import { getBotDifficultyProfile, normalizeBotDifficultyLevel } from '@/lib/bot/botDifficulty';
import {
  encodeBotGameConfigRow,
  parseBotGameConfigFromGameRow,
  defaultBotGameConfig,
} from '@/lib/bot/botGameConfig';
import { selectBotMoveForStyle } from '@/lib/bot/botPersonalityStyle';
import { moverPovCentipawn, toWhitePov } from '@/lib/chess';

test.describe('bot play foundation', () => {
  test('uciFromVerboseMove never appends bogus capture suffix', () => {
    const board = new Chess();
    const capture = board.moves({ verbose: true }).find((m) => m.flags.includes('c'));
    if (!capture) return;
    const uci = uciFromVerboseMove(capture);
    expect(uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    expect(uci).not.toContain('x');
  });

  test('heuristic candidates are legal UCI', async () => {
    const profile = getBotDifficultyProfile(2);
    const lines = await buildBotCandidatesFromFen(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      profile,
    );
    expect(lines.length).toBeGreaterThan(0);
    const board = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    for (const line of lines) {
      const uci = line.move;
      const ok = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
      });
      expect(ok).toBeTruthy();
      board.undo();
    }
  });

  test('difficulty normalizes to 1-6', () => {
    expect(normalizeBotDifficultyLevel(99)).toBe(3);
    expect(normalizeBotDifficultyLevel(1)).toBe(1);
    expect(normalizeBotDifficultyLevel(6)).toBe(6);
  });

  test('bot config round-trips from bot_settings', () => {
    const cfg = defaultBotGameConfig(4, 'aggressive', 'Test Bot');
    const { bot_settings } = encodeBotGameConfigRow(cfg);
    const parsed = parseBotGameConfigFromGameRow({ source_type: 'bot_game', bot_settings });
    expect(parsed?.accl_bot_v1.difficulty).toBe(4);
    expect(parsed?.accl_bot_v1.personalityStyle).toBe('aggressive');
  });

  test('personality style returns a move from candidates', () => {
    const candidates = [
      { move: 'e7e5', scoreCp: 80 },
      { move: 'g8f6', scoreCp: 40 },
      { move: 'd7d6', scoreCp: 10 },
    ];
    const pick = selectBotMoveForStyle('balanced', candidates, 3, 0);
    expect(pick?.move).toBeTruthy();
  });

  test('Black-to-move selection stays mover-POV after White-POV normalization', () => {
    const whitePovLines = [
      { move: 'e7e5', score: toWhitePov({ kind: 'cp', cp: 80 }, 'b') },
      { move: 'a7a6', score: toWhitePov({ kind: 'cp', cp: -40 }, 'b') },
    ];
    const rankedWhite = [...whitePovLines].sort((a, b) => {
      const aCp = a.score.kind === 'cp' ? a.score.cp : -99999;
      const bCp = b.score.kind === 'cp' ? b.score.cp : -99999;
      return bCp - aCp;
    });
    expect(rankedWhite[0]?.move).toBe('a7a6');

    const moverLines = whitePovLines.map((line) => ({
      move: line.move,
      scoreCp: moverPovCentipawn(line.score, 'b'),
    }));
    const pick = selectBotMoveForStyle('endgame', moverLines, 6, 0);
    expect(pick?.move).toBe('e7e5');
  });
});
