import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

import { shouldUsePublicSpectateRpc } from '@/lib/gameRouteVisibility';

const gamePagePath = join(process.cwd(), 'app', 'game', '[id]', 'page.tsx');

test.describe('Phase 1 — tournament spectator + reconnect (unit)', () => {
  test('logged-in tournament spectator must use public spectate RPC (?spectate=1)', () => {
    expect(
      shouldUsePublicSpectateRpc({ publicSpectateUrlFlag: true, userId: 'user-uuid' }),
    ).toBe(true);
    expect(
      shouldUsePublicSpectateRpc({ publicSpectateUrlFlag: false, userId: 'user-uuid' }),
    ).toBe(false);
  });

  test('game page reconciles via polling + debounced scheduleRefresh (not competing writers)', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    expect(src).toContain('snapshotInFlightRef');
    expect(src).toContain('scheduleRefresh');
    expect(src).toContain('void loadGameSnapshot()');
    expect(src).toContain(', 2000)');
    expect(src).toContain('debounceMs');
    expect(src).toContain('postgres_changes');
  });

  test('spectate RPC orders move_logs by created_at (migration)', () => {
    const sql = readFileSync(
      'supabase/migrations/20260411130100_public_spectate_game_snapshot_rpc.sql',
      'utf8',
    );
    expect(sql).toContain('order by ml.created_at asc');
    expect(sql).toContain("'move_logs'");
  });

  test('submit-move rejects non-participants (authority boundary)', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts'), 'utf8');
    expect(src).toMatch(/white_player_id|black_player_id/);
    expect(src).toMatch(/forbidden|not a participant|not.*player/i);
  });

  test('verification script documents boundaries (no new spectator features)', () => {
    const src = readFileSync('scripts/tournament-spectator-reconnect-verification.mjs', 'utf8');
    expect(src).toContain('SPECTATOR_CHURN_COUNT');
    expect(src).toContain('poll_realtime_boundary');
    expect(src).toContain('spectator_read_only: true');
    expect(src).toContain('new_spectator_features: false');
  });

  test('public viewer must not render next-game move hint (grep game page)', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    expect(src).toContain('!isPublicViewer && game.status !== \'finished\' && nextGameWithMyMoveId');
    expect(src).toContain('data-testid="game-next-move-hint"');
  });
});
