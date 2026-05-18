import { expect, test } from '@playwright/test';
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  applySanitizedUciToBoard,
  isConfiguredBotPlayerId,
  sanitizeBotUciMove,
  terminalStateFromBoard,
  verifyBotReplyPreconditions,
} from '@/lib/bot/botMoveCommit';
import { defaultBotGameConfig } from '@/lib/bot/botGameConfig';
import { BOT_USER_IDS } from '@/lib/bot/botIdentity';

const HUMAN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test.describe('bot move commit guards', () => {
  test('configured bot player ids are recognized', () => {
    expect(isConfiguredBotPlayerId(BOT_USER_IDS['Cardi Bot'])).toBe(true);
    expect(isConfiguredBotPlayerId(HUMAN_ID)).toBe(false);
  });

  test('verifyBotReplyPreconditions passes for active bot_game on bot turn', () => {
    const board = new Chess(START_FEN);
    board.move('e4');
    const fenAfterHuman = board.fen();
    const cfg = defaultBotGameConfig(3, 'balanced', 'Cardi Bot');
    const pre = verifyBotReplyPreconditions(
      {
        source_type: 'bot_game',
        status: 'active',
        fen: fenAfterHuman,
        turn: 'black',
        white_player_id: HUMAN_ID,
        black_player_id: BOT_USER_IDS['Cardi Bot'],
      },
      {
        humanPlayerId: HUMAN_ID,
        expectedFen: fenAfterHuman,
        botConfig: cfg,
      },
    );
    expect(pre.ok).toBe(true);
    if (pre.ok) {
      expect(pre.botMoverColor).toBe('black');
      expect(pre.sideToMoveUserId).toBe(BOT_USER_IDS['Cardi Bot']);
    }
  });

  test('stale FEN fails with stale_bot_fen', () => {
    const board = new Chess(START_FEN);
    board.move('e4');
    const fenAfterHuman = board.fen();
    const pre = verifyBotReplyPreconditions(
      {
        source_type: 'bot_game',
        status: 'active',
        fen: fenAfterHuman,
        turn: 'black',
        white_player_id: HUMAN_ID,
        black_player_id: BOT_USER_IDS['Cardi Bot'],
      },
      {
        humanPlayerId: HUMAN_ID,
        expectedFen: START_FEN,
        botConfig: defaultBotGameConfig(3, 'balanced', 'Cardi Bot'),
      },
    );
    expect(pre.ok).toBe(false);
    if (!pre.ok) expect(pre.code).toBe('stale_bot_fen');
  });

  test('human turn after ply fails bot_turn_mismatch', () => {
    const pre = verifyBotReplyPreconditions(
      {
        source_type: 'bot_game',
        status: 'active',
        fen: START_FEN,
        turn: 'white',
        white_player_id: HUMAN_ID,
        black_player_id: BOT_USER_IDS['Cardi Bot'],
      },
      {
        humanPlayerId: HUMAN_ID,
        expectedFen: START_FEN,
        botConfig: defaultBotGameConfig(3, 'balanced', 'Cardi Bot'),
      },
    );
    expect(pre.ok).toBe(false);
    if (!pre.ok) expect(pre.code).toBe('bot_turn_mismatch');
  });

  test('non-bot seat fails bot_seat_mismatch', () => {
    const board = new Chess(START_FEN);
    board.move('e4');
    const pre = verifyBotReplyPreconditions(
      {
        source_type: 'bot_game',
        status: 'active',
        fen: board.fen(),
        turn: 'black',
        white_player_id: HUMAN_ID,
        black_player_id: HUMAN_ID,
      },
      {
        humanPlayerId: HUMAN_ID,
        expectedFen: board.fen(),
        botConfig: defaultBotGameConfig(3, 'balanced', 'Cardi Bot'),
      },
    );
    expect(pre.ok).toBe(false);
    if (!pre.ok) expect(pre.code).toBe('bot_turn_mismatch');
  });

  test('invalid UCI is rejected by applySanitizedUciToBoard', () => {
    const board = new Chess(START_FEN);
    board.move('e4');
    expect(applySanitizedUciToBoard(board.fen(), 'e7x5')).toBeNull();
    expect(sanitizeBotUciMove('e7e5')).toBe('e7e5');
  });

  test('legal UCI applies on bot FEN', () => {
    const board = new Chess(START_FEN);
    board.move('e4');
    const applied = applySanitizedUciToBoard(board.fen(), 'e7e5');
    expect(applied?.moved.san).toBeTruthy();
  });

  test('terminal mate detection after bot ply', () => {
    const board = new Chess();
    board.move('f3');
    board.move('e5');
    board.move('g4');
    board.move('Qh4');
    expect(board.isCheckmate()).toBe(true);
    const terminal = terminalStateFromBoard(board, 'black');
    expect(terminal?.endReason).toBe('checkmate');
    expect(terminal?.result).toBe('black_win');
  });
});

test.describe('submit-move bot hardening (static)', () => {
  test('bot commit uses composite RPC module not raw games.update', () => {
    const p = join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts');
    const src = readFileSync(p, 'utf8');
    const commitSrc = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );
    expect(src).toContain('commitBotGameTurn');
    expect(commitSrc).toContain('apply_bot_game_turn_system');
    expect(commitSrc).toContain('verifyBotReplyPreconditions');
    expect(commitSrc).not.toMatch(/\.from\(['"]games['"]\)\s*\n?\s*\.update\(/);
    expect(src).not.toContain('function sleep');
    expect(src).not.toContain('await sleep');
    expect(src).toContain('bot_move_invalid_uci');
    expect(src).toContain('human_move_applied');
    expect(src).toContain('think_ms');
    const guardSrc = readFileSync(join(process.cwd(), 'lib', 'bot', 'botMoveCommit.ts'), 'utf8');
    expect(guardSrc).toContain('bot_turn_mismatch');
  });

  test('PvP path still uses single-ply apply_move_and_maybe_finish_system', () => {
    const p = join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts');
    const src = readFileSync(p, 'utf8');
    const pvpBlock = src.slice(src.indexOf('let committedHumanRow'));
    expect(pvpBlock).toContain('apply_move_and_maybe_finish_system');
    expect(src).not.toContain('finish_game_system');
  });

  test('bot terminal finish passes result through composite RPC builder', () => {
    const commitSrc = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );
    expect(commitSrc).toContain('botTerminal');
    expect(commitSrc).toContain('buildBotGameTurnRpcParams');
  });

  test('finished bot games use same DB finish path as humans (analysis auto-enqueue)', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260430280000_apply_move_and_finish_atomic.sql'),
      'utf8',
    );
    expect(migration).toContain('finish_game_system');
    const autoEnqueue = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260407020000_finished_game_analysis_auto_enqueue.sql'),
      'utf8',
    );
    expect(autoEnqueue).toContain('trg_games_enqueue_finished_game_analysis');
  });
});
