import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

import { freePlayUserBlockedForTargetSlot, freePlayTargetSlot } from '@/lib/freePlayQueueSlotConflict';
import type { FreePlayBusyUserGameRow } from '@/lib/hasActiveWaitingLiveFreeGame';

test.describe('Phase 1 — tournament ↔ free-play coexistence (unit)', () => {
  test('daily free games do not block new live queue slot (async coexistence)', () => {
    const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const target = freePlayTargetSlot('blitz', '3+2', false);

    const dailyFree: FreePlayBusyUserGameRow = {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      white_player_id: userId,
      black_player_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      tempo: 'daily',
      live_time_control: '1d',
      rated: false,
      status: 'active',
    };
    expect(freePlayUserBlockedForTargetSlot(userId, dailyFree, target)).toBe(false);
  });

  test('loadFreePlayBusyUserGames query contract excludes tournament (grep migration)', () => {
    const src = readFileSync('lib/hasActiveWaitingLiveFreeGame.ts', 'utf8');
    expect(src).toContain(".eq('play_context', 'free')");
    expect(src).toContain('.is(\'tournament_id\', null)');
  });

  test('supersede SQL scopes free-only (migration)', () => {
    const sql = readFileSync(
      'supabase/migrations/20260528160000_free_play_supersede_not_daily_and_host_busy_skip_async.sql',
      'utf8',
    );
    expect(sql).toContain('play_context = \'free\'');
    expect(sql).toContain('tournament_id is null');
  });

  test('open-seat join rejects non-free rows (migration)', () => {
    const sql = readFileSync('supabase/migrations/20260410120000_free_play_lifecycle_guard.sql', 'utf8');
    expect(sql).toContain('not a free-play open seat');
    expect(sql).toContain('open_row.tournament_id is not null');
  });

  test('coexistence UI is warn-only (component)', () => {
    const src = readFileSync('components/tournament/TournamentCoexistenceNotice.tsx', 'utf8');
    expect(src).toContain('Informational only');
    expect(src).not.toContain('.insert(');
    expect(src).not.toContain('createSeatedGameGuard');
  });
});
