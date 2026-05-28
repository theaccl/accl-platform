import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260619150000_accl_official_time_control_parity.sql';

test.describe('ACCL official time control parity migration (static)', () => {
  test('migration file exists with expected timestamp ordering', () => {
    const path = join(process.cwd(), 'supabase', 'migrations', MIGRATION);
    const sql = readFileSync(path, 'utf8');
    expect(sql).toContain("'2m'");
    expect(sql).toContain("'2+0'");
    expect(sql).toContain("'7d'");
    expect(sql).toContain("'20m'");
    expect(sql).toContain("'5d'");
    expect(sql).toContain("when '7d' then 'daily_7_day'");
    expect(sql).toContain("when '2m' then 'bullet_2_0'");
    expect(sql).not.toContain('2+2');
    expect(sql).not.toContain('10+5');
    expect(sql).not.toContain('15+10');
  });

  test('migration sorts after badge foundation', () => {
    const stamp = MIGRATION.slice(0, 14);
    expect(stamp > '20260619120000').toBe(true);
    expect(stamp > '20260619130000').toBe(true);
  });

  test('no duplicate migration basename', () => {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const names = readdirSync(join(process.cwd(), 'supabase', 'migrations')).filter((n) =>
      n.includes('accl_official_time_control_parity'),
    );
    expect(names).toEqual([MIGRATION]);
  });
});
