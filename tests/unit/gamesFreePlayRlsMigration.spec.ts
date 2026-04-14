import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260430270000_games_free_play_rls.sql'
);

test.describe('games free-play RLS migration (static)', () => {
  test('defines insert/select/update policies for authenticated free open seat', () => {
    const src = readFileSync(migrationPath, 'utf8');
    expect(src).toContain('enable row level security');
    expect(src).toContain('games_authenticated_insert_free_open_seat');
    expect(src).toContain('games_authenticated_select_participant');
    expect(src).toContain('games_authenticated_update_participant');
    expect(src).toContain('white_player_id = (select auth.uid())');
    expect(src).toContain('black_player_id is null');
    expect(src).toContain("play_context = 'free'");
    expect(src).toContain('tournament_id is null');
  });
});
