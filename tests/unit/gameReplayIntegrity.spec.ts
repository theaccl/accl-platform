import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COMPOSITE_RPC_DESIGN_NOTE_VERSION } from '@/lib/replay/compositeRpcDesignNote';
import {
  STANDARD_START_FEN,
  verifyGameReplayIntegrity,
  replayIntegrityWarning,
} from '@/lib/replay/gameReplayIntegrity';

test.describe('game replay integrity', () => {
  test('empty logs match start FEN', () => {
    const r = verifyGameReplayIntegrity({
      gameFinalFen: STANDARD_START_FEN,
      logs: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plyCount).toBe(0);
  });

  test('single ply replays to final FEN', () => {
    const fenAfter =
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const r = verifyGameReplayIntegrity({
      gameFinalFen: fenAfter,
      logs: [
        {
          san: 'e4',
          from_sq: 'e2',
          to_sq: 'e4',
          fen_before: STANDARD_START_FEN,
          fen_after: fenAfter,
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  test('detects missing log vs final FEN', () => {
    const r = verifyGameReplayIntegrity({
      gameFinalFen:
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      logs: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('no_logs');
  });

  test('detects replay FEN mismatch', () => {
    const r = verifyGameReplayIntegrity({
      gameFinalFen: STANDARD_START_FEN,
      logs: [
        {
          san: 'e4',
          from_sq: 'e2',
          to_sq: 'e4',
          fen_before: STANDARD_START_FEN,
          fen_after:
            'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('replay_fen_mismatch');
  });

  test('detects duplicate ply', () => {
    const ply = {
      san: 'e4',
      from_sq: 'e2',
      to_sq: 'e4',
      fen_before: STANDARD_START_FEN,
      fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    };
    const r = verifyGameReplayIntegrity({
      gameFinalFen: ply.fen_after,
      logs: [ply, ply],
      expectedLogCount: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('duplicate_ply');
  });

  test('detects unexpected log count', () => {
    const fenAfter =
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const r = verifyGameReplayIntegrity({
      gameFinalFen: fenAfter,
      logs: [
        {
          san: 'e4',
          from_sq: 'e2',
          to_sq: 'e4',
          fen_before: STANDARD_START_FEN,
          fen_after: fenAfter,
        },
      ],
      expectedLogCount: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unexpected_log_count');
  });

  test('replayIntegrityWarning surfaces failure', () => {
    const warn = replayIntegrityWarning(STANDARD_START_FEN, [
      {
        san: 'e4',
        from_sq: 'e2',
        to_sq: 'e4',
        fen_before: STANDARD_START_FEN,
        fen_after:
          'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      },
    ]);
    expect(warn?.code).toBe('replay_fen_mismatch');
  });
});

test.describe('move log insert hardening (static)', () => {
  test('submit-move uses transactional p_move_log on RPC', () => {
    const p = join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('p_move_log');
    expect(src).toContain('validateRpcMoveLogPayload');
    expect(src).not.toContain('insertGameMoveLog');
    expect(src).not.toMatch(/await supabase\.from\('game_move_logs'\)\.insert/);
  });

  test('composite RPC design note is versioned', () => {
    expect(COMPOSITE_RPC_DESIGN_NOTE_VERSION).toBe('accl_phase_1d_v1');
  });
});
