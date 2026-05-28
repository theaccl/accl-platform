import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260619171000_fix_daily_rating_bucket_precedence.sql';
const PARITY_MIGRATION = '20260619150000_accl_official_time_control_parity.sql';

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
}

function classifyRatingBucketFnBody(sql: string): string {
  const start = sql.indexOf('create or replace function public.classify_rating_bucket');
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start);
}

test.describe('daily rating bucket precedence migration (static)', () => {
  test('migration exists and sorts after legacy compat migration', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain('classify_rating_bucket');
    const stamp = MIGRATION.slice(0, 14);
    expect(stamp > '20260619170000').toBe(true);
  });

  test('no duplicate precedence migration basename', () => {
    const names = readdirSync(join(process.cwd(), 'supabase', 'migrations')).filter((n) =>
      n.includes('fix_daily_rating_bucket_precedence'),
    );
    expect(names).toEqual([MIGRATION]);
  });

  test('daily tempo is checked before 1d/2d/3d correspondence shortcut', () => {
    const body = classifyRatingBucketFnBody(readMigration(MIGRATION));
    const dailyIdx = body.indexOf("if t = 'daily'");
    const dayTokenIdx = body.indexOf("if lc in ('1d', '2d', '3d')");
    expect(dailyIdx).toBeGreaterThan(-1);
    expect(dayTokenIdx).toBeGreaterThan(-1);
    expect(dailyIdx).toBeLessThan(dayTokenIdx);
  });

  test('free/daily day controls must not map to free_correspondence', () => {
    const body = classifyRatingBucketFnBody(readMigration(MIGRATION));
    const dailyBlockStart = body.indexOf("if t = 'daily'");
    const dailyBlockEnd = body.indexOf("if lc in ('1d', '2d', '3d')", dailyBlockStart);
    expect(dailyBlockEnd).toBeGreaterThan(dailyBlockStart);
    const dailyBlock = body.slice(dailyBlockStart, dailyBlockEnd);
    expect(dailyBlock).toContain("'1d'");
    expect(dailyBlock).toContain("'2d'");
    expect(dailyBlock).toContain("'3d'");
    expect(dailyBlock).toContain("return pref || 'daily'");
    expect(dailyBlock).not.toContain('correspondence');

    expect(body).toContain("classify_rating_bucket('free', 'daily', '1d')");
    expect(body).toContain("classify_rating_bucket('free', 'daily', '2d')");
    expect(body).toContain("classify_rating_bucket('free', 'daily', '3d')");
    expect(body).toContain('-- free_daily');
    expect(body).not.toMatch(
      /classify_rating_bucket\s*\(\s*'free'\s*,\s*'daily'\s*,\s*'1d'\s*\)[^;]*free_correspondence/i,
    );
  });

  test('preserves 5+5 live bucket and documents daily/live spot checks', () => {
    const sql = readMigration(MIGRATION);
    expect(sql).toContain("'5+5'");
    expect(sql).toContain("return pref || 'live'");
    expect(sql).toContain("classify_rating_bucket('free', 'daily', '7d')");
    expect(sql).toContain("classify_rating_bucket('free', 'live', '5+5')");
  });

  test('P1 and badge daily tracks remain on parity migration', () => {
    const parity = readMigration(PARITY_MIGRATION);
    expect(parity).toContain("when '1d' then 'daily_1_day'");
    expect(parity).toContain("when '7d' then 'daily_7_day'");
    expect(parity).toContain("return 'free_day'");
    expect(parity).toContain("if lc in ('1d', '2d', '3d', '5d', '7d')");
  });
});
