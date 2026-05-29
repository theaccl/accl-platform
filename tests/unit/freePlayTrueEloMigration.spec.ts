import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const MIGRATION = '20260619180000_free_play_true_elo_rating.sql';

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
}

test.describe('free-play true Elo migration (static)', () => {
  test('migration exists and sorts after daily precedence fix', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toContain(MIGRATION);
    const latestRatingFix = '20260619171000_fix_daily_rating_bucket_precedence.sql';
    expect(MIGRATION > latestRatingFix).toBe(true);
  });

  test('no duplicate true-elo migration basename', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.includes('free_play_true_elo'));
    expect(files).toHaveLength(1);
  });

  test('uses standard Elo expected-score formula with denominator 400', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain('power(10.0::numeric');
    expect(sql).toContain('/ 400.0');
    expect(sql).toContain('elo_expected_score');
  });

  test('K-factor schedule is 40 / 32 / 20 at the documented boundaries', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain('< 8 then 40');
    expect(sql).toContain('< 26 then 32');
    expect(sql).toContain('else 20');
  });

  test('delta uses round(K * (score - expected)) and not a hardcoded +/-10 for free play', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain('round(w_k * (w_score - w_e))::int');
    expect(sql).toContain('round(b_k * (b_score - b_e))::int');
  });

  test('free-play branch is true Elo; tournament branch preserves fixed +/-10', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain("v_model := 'v2_elo_free'");
    expect(sql).toContain("v_model := 'v1_fixed_tournament'");
    // tournament fixed-point still present
    expect(sql).toMatch(/w_delta := 10;\s*\n\s*b_delta := -10;/);
  });

  test('preserves clamps, idempotency, badge order, and ledger append order', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain('greatest(100, least(4000, w_before_p + w_delta))');
    expect(sql).toContain("coalesce(r.rating_applied, false)");
    const badgeIdx = sql.indexOf('apply_free_play_badge_settlement(p_game_id, out)');
    const ledgerIdx = sql.indexOf('append_rating_history_ledger_for_game_apply(p_game_id, out, v_badge)');
    expect(badgeIdx).toBeGreaterThan(-1);
    expect(ledgerIdx).toBeGreaterThan(badgeIdx);
  });

  test('records elo audit metadata fields for ledger', () => {
    const sql = readMigration(MIGRATION);
    for (const key of ['e_score', 'k_factor_applied', 'delta_raw', 'delta_clamped', 'rating_model_version']) {
      expect(sql).toContain(key);
    }
    expect(sql).toContain("|| coalesce(v_side->'elo_meta', '{}'::jsonb)");
  });

  test('does not edit older applied migrations (self-contained create or replace)', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain('create or replace function public.apply_free_play_rating_update_core');
    expect(sql).toContain('create or replace function public.append_rating_history_ledger_for_game_apply');
  });
});
