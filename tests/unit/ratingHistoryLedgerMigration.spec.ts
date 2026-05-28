import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260619160000_rating_history_ledger_foundation.sql';

test.describe('rating history ledger migration (static)', () => {
  test('migration exists and sorts after parity migration', () => {
    const path = join(process.cwd(), 'supabase', 'migrations', MIGRATION);
    const sql = readFileSync(path, 'utf8');
    expect(sql).toContain('player_rating_history_ledger');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('player_rating_history_ledger_select_own');
    expect(sql).toContain('player_rating_history_ledger_service_role_all');
    expect(sql).toContain('uniq_rating_history_game_track');
    expect(sql).toContain('uniq_rating_history_backfill_game_track');
    expect(sql).toContain('uniq_rating_history_bracket_settlement');
    expect(sql).toContain('uniq_rating_history_tournament_batch');
    expect(sql).toContain('append_rating_history_ledger_for_game_apply');
    expect(sql).toContain('regprocedure');
    expect(sql).not.toMatch(
      /revoke all on function public\.rating_history_ledger_insert_row\s*\(/,
    );
    expect(sql).not.toMatch(/create policy[^;]*for select[^;]*to anon/i);
    const stamp = MIGRATION.slice(0, 14);
    expect(stamp > '20260619150000').toBe(true);
  });

  test('no duplicate ledger migration basename', () => {
    const names = readdirSync(join(process.cwd(), 'supabase', 'migrations')).filter((n) =>
      n.includes('rating_history_ledger_foundation'),
    );
    expect(names).toEqual([MIGRATION]);
  });

  test('maps bullet 2 and daily 7d badge tracks', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    expect(sql).toContain("when 'bullet_2_0' then 'free_bullet_2_0'");
    expect(sql).toContain("when 'daily_7_day' then 'free_daily_7d'");
  });
});
