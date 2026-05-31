import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NEUTRAL_OPEN_SEAT_CANCEL_FINISH } from '@/lib/gameContinuityPresentation';
import {
  NEUTRAL_OPEN_SEAT_CANCELLED_BANNER,
  finishedGameResultBannerText,
  isNeutralPreStartOpenSeatEndReason,
} from '@/lib/finishedGame';

const MIGRATION = '20260620130000_games_end_reason_abandoned_before_move.sql';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const RATING_MIGRATION = '20260619180000_free_play_true_elo_rating.sql';
const LIFECYCLE_MIGRATION = '20260410120000_free_play_lifecycle_guard.sql';

/** Verbatim live CHECK tokens (Supabase SQL Editor extraction). */
const LIVE_END_REASON_TOKENS = [
  'abandoned',
  'checkmate',
  'draw',
  'draw_agreement',
  'insufficient_material',
  'resign',
  'stalemate',
  'superseded',
  'threefold_repetition',
  'timeout',
] as const;

const ADDITIVE_WRITER_TOKENS = ['abandoned_before_move', 'fifty_move_rule', 'expired_open_seat'] as const;

const EXCLUDED_TOKENS = ['fifty_move', 'no_first_move', 'cancelled', 'aborted'] as const;

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
}

function quotedTokensInCheck(sql: string): string[] {
  const match = sql.match(
    /games_end_reason_check\s+check\s*\([\s\S]*?\bor\s+lower\(btrim\(end_reason::text\)\)\s+in\s*\(([\s\S]*?)\)\s*\)/i,
  );
  if (!match) return [];
  const inner = match[1] ?? '';
  return [...inner.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

test.describe('games end_reason CHECK migration (static)', () => {
  test('migration exists and sorts after seated-live block migration', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toContain(MIGRATION);
    expect(MIGRATION > '20260620120000_free_play_block_new_live_seat_while_seated_live.sql').toBe(true);
  });

  test('drops and re-adds games_end_reason_check additively', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain('drop constraint games_end_reason_check');
    expect(sql).toContain('add constraint games_end_reason_check');
    expect(sql).not.toMatch(/alter table public\.games[^;]+alter column end_reason/i);
  });

  test('preserves all ten live SQL Editor tokens exactly', () => {
    const tokens = quotedTokensInCheck(readMigration(MIGRATION));
    for (const live of LIVE_END_REASON_TOKENS) {
      expect(tokens, `missing live token: ${live}`).toContain(live);
    }
  });

  test('includes abandoned_before_move, fifty_move_rule, and expired_open_seat', () => {
    const tokens = quotedTokensInCheck(readMigration(MIGRATION));
    for (const added of ADDITIVE_WRITER_TOKENS) {
      expect(tokens, `missing additive token: ${added}`).toContain(added);
    }
    const extras = tokens.filter(
      (t) => !LIVE_END_REASON_TOKENS.includes(t as (typeof LIVE_END_REASON_TOKENS)[number]),
    );
    expect(extras.sort()).toEqual([...ADDITIVE_WRITER_TOKENS].sort());
  });

  test('excludes fifty_move, no_first_move, and speculative aliases', () => {
    const tokens = quotedTokensInCheck(readMigration(MIGRATION));
    for (const bad of EXCLUDED_TOKENS) {
      expect(tokens).not.toContain(bad);
    }
    expect(tokens).not.toContain('forfeit');
    expect(tokens).not.toContain('resignation');
  });

  test('neutral pre-start cancel uses draw + abandoned_before_move', () => {
    expect(NEUTRAL_OPEN_SEAT_CANCEL_FINISH).toEqual({
      p_result: 'draw',
      p_end_reason: 'abandoned_before_move',
    });
  });

  test('rating lifecycle void list includes abandoned_before_move and expired_open_seat', () => {
    const sql = readMigration(RATING_MIGRATION);
    expect(sql).toContain("'abandoned_before_move'");
    expect(sql).toContain("'expired_open_seat'");
    expect(sql).toContain('lifecycle_void_finish');
  });

  test('terminal writer uses fifty_move_rule on human board path', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain("end_reason: 'fifty_move_rule'");
    const bot = readFileSync(join(process.cwd(), 'lib', 'bot', 'botMoveCommit.ts'), 'utf8');
    expect(bot).toContain("endReason: 'fifty_move_rule'");
  });

  test('expire_open_seats RPC writes expired_open_seat via finish_game_system', () => {
    const sql = readMigration(LIFECYCLE_MIGRATION);
    expect(sql).toContain('expire_open_seats');
    expect(sql).toMatch(/finish_game_system\([^)]*'expired_open_seat'\)/);
  });

  test('finished presentation maps abandoned_before_move to neutral banner', () => {
    expect(isNeutralPreStartOpenSeatEndReason('abandoned_before_move')).toBe(true);
    expect(isNeutralPreStartOpenSeatEndReason('abandoned')).toBe(false);
    expect(
      finishedGameResultBannerText({
        status: 'finished',
        result: 'draw',
        end_reason: 'abandoned_before_move',
        white_player_id: 'w',
        black_player_id: null,
      }),
    ).toBe(NEUTRAL_OPEN_SEAT_CANCELLED_BANNER);
  });

  test('PGN termination guard remains neutral for abandoned_before_move', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain('isNeutralPreStartOpenSeatEndReason');
    expect(page).toMatch(/terminationPgnTag[\s\S]{0,220}isNeutralPreStartOpenSeatEndReason/);
  });
});
