import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260813170000_clock_integrity_terminal_snapshot.sql';

test.describe('clock integrity repair', () => {
  test('snapshots only the active clock at the shared terminal transition', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');

    expect(sql).toContain("in ('live', 'daily')");
    expect(sql).toContain('g.last_move_at is not null');
    expect(sql).toContain("if lower(trim(g.turn)) = 'white'");
    expect(sql).toContain('v_white_clock_ms - v_elapsed_ms');
    expect(sql).toContain('v_black_clock_ms - v_elapsed_ms');
    expect(sql).toContain('greatest(0,');
    expect(sql).toContain('white_clock_ms = v_white_clock_ms::integer');
    expect(sql).toContain('black_clock_ms = v_black_clock_ms::integer');
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
  });

  test('keeps the privileged core function non-callable by runtime roles', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');

    expect(sql).toContain("set search_path = ''");
    expect(sql).toMatch(
      /alter function public\.clock_budget_ms_for_live_sweep\(text\)\s+set search_path = ''/i
    );
    expect(sql).toContain(
      'revoke all on function public.finish_game_core(uuid, text, text, uuid) from authenticated'
    );
    expect(sql).not.toContain('grant execute on function public.finish_game_core');
  });

  test('bundles private game and move-log reconciliation on incoming move events', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');

    expect(page).toContain("includeMoveLogs ? 'with-logs' : 'game-only'");
    expect(page).toContain('const [gameResult, moveLogsResult] = await Promise.all([');
    expect(page).toContain("event: 'INSERT', schema: 'public', table: 'game_move_logs'");
    expect(page).toMatch(/snapshot:\s*true,\s*logs:\s*false,\s*debounceMs:\s*0/);
    expect(page).not.toMatch(/event: 'INSERT'[\s\S]{0,300}snapshot:\s*false/);
  });

  test('keeps the two-second clock poll game-row only', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');

    expect(page).toMatch(
      /setInterval\(\(\) => \{\s*void loadGameSnapshot\(undefined, \{ includeMoveLogs: false \}\);\s*\}, 2000\)/
    );
  });
});
