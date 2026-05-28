import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260619170000_legacy_rating_bucket_and_badge_settlement_compat.sql';
const PARITY_MIGRATION = '20260619150000_accl_official_time_control_parity.sql';

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
}

test.describe('legacy rating bucket + badge settlement compat migration (static)', () => {
  test('migration exists and sorts after rating history ledger', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain('classify_rating_bucket');
    expect(sql).toContain('5f79f6d7-2368-4a49-b626-5f3fa7f3694b');
    const stamp = MIGRATION.slice(0, 14);
    expect(stamp > '20260619160000').toBe(true);
  });

  test('no duplicate compat migration basename', () => {
    const names = readdirSync(join(process.cwd(), 'supabase', 'migrations')).filter((n) =>
      n.includes('legacy_rating_bucket_and_badge_settlement_compat'),
    );
    expect(names).toEqual([MIGRATION]);
  });

  test('legacy classify_rating_bucket maps 5+5 to free_live pace bucket', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain("'5+5'");
    expect(sql).toContain("return pref || 'live'");
    expect(sql).not.toMatch(/if\s+strpos\s*\(\s*lc\s*,\s*'\+'\s*\)/);
    expect(sql).toContain("'7d'");
    expect(sql).toContain("'20m'");
    expect(sql).toContain("return pref || 'daily'");
    expect(sql).toContain("-- free_live");
    expect(sql).toContain("classify_rating_bucket('free', 'live', '5+5')");
  });

  test('P1 and badge classifiers support 5+5 via parity migration', () => {
    const parity = readMigration(PARITY_MIGRATION);
    expect(parity).toContain('classify_p1_rating_bucket');
    expect(parity).toContain('classify_free_badge_track_key');
    expect(parity).toContain("if inc1 = 5 and inc2 = 5 then return 'free_blitz'");
    expect(parity).toContain("when '5+5' then 'blitz_5_5'");
    expect(parity).toContain("when '7d' then 'daily_7_day'");
  });

  test('badge settlement shim is conditional and never fakes applied=true', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain('to_regprocedure(');
    expect(sql).toContain('apply_free_play_badge_settlement(uuid,jsonb)');
    expect(sql).toContain('badge_settlement_function_missing_compat_shim');
    expect(sql).toContain("'applied', false");

    const shimStart = sql.indexOf('$compat$');
    const shimEnd = sql.indexOf('$compat$', shimStart + 1);
    expect(shimStart).toBeGreaterThan(-1);
    expect(shimEnd).toBeGreaterThan(shimStart);
    const shimBlock = sql.slice(shimStart, shimEnd + '$compat$'.length);
    expect(shimBlock).not.toContain("'applied', true");
  });
});
