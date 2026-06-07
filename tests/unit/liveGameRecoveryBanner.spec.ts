import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LIVE_GAME_RECOVERY_RETURN_LABEL,
  liveRecoveryBoardLabel,
  selectSeatedLiveRecoveryRows,
} from '@/lib/liveGameRecovery';
import type { LobbyObligationRow } from '@/lib/lobbyObligationPresentation';

const root = process.cwd();
function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

function row(partial: Partial<LobbyObligationRow>): LobbyObligationRow {
  return {
    id: 'g',
    status: 'active',
    tempo: 'live',
    live_time_control: '10m',
    turn: 'white',
    white_player_id: 'u1',
    black_player_id: 'u2',
    ...partial,
  } as LobbyObligationRow;
}

test.describe('live-game recovery banner — presentation', () => {
  test('seated live board is selected when it is YOUR move', () => {
    const rows = [row({ id: 'a', turn: 'white', white_player_id: 'u1', black_player_id: 'u2' })];
    expect(selectSeatedLiveRecoveryRows(rows, 'u1').map((r) => r.id)).toEqual(['a']);
  });

  test("seated live board is selected when it is the OPPONENT'S move", () => {
    const rows = [row({ id: 'a', turn: 'black', white_player_id: 'u1', black_player_id: 'u2' })];
    expect(selectSeatedLiveRecoveryRows(rows, 'u1').map((r) => r.id)).toEqual(['a']);
    expect(selectSeatedLiveRecoveryRows(rows, 'u2').map((r) => r.id)).toEqual(['a']);
  });

  test('waiting seat (no opponent) is NOT a live-game banner row', () => {
    const rows = [row({ id: 'seat', black_player_id: null, white_player_id: 'u1' })];
    expect(selectSeatedLiveRecoveryRows(rows, 'u1')).toEqual([]);
  });

  test('open live seat stays out of banner candidates (subsection only)', () => {
    const open = row({ id: 'open', black_player_id: null, white_player_id: 'u1', live_time_control: '3m' });
    const seated = row({ id: 'seated', black_player_id: 'u2', white_player_id: 'u1', live_time_control: '3m' });
    expect(selectSeatedLiveRecoveryRows([open, seated], 'u1').map((r) => r.id)).toEqual(['seated']);
  });

  test('daily / correspondence / async rows are excluded', () => {
    const rows = [
      row({ id: 'd', tempo: 'daily', live_time_control: '1d' }),
      row({ id: 'c', tempo: 'correspondence', live_time_control: '3d' }),
    ];
    expect(selectSeatedLiveRecoveryRows(rows, 'u1')).toEqual([]);
  });

  test('finished live row is excluded from banner candidates', () => {
    const rows = [row({ id: 'done', status: 'finished', end_reason: 'draw_agreement' })];
    expect(selectSeatedLiveRecoveryRows(rows, 'u1')).toEqual([]);
  });

  test('multiple seated live candidates pick deterministic most-urgent row', () => {
    const olderYourMove = row({
      id: 'older',
      turn: 'white',
      white_player_id: 'u1',
      black_player_id: 'u2',
      updated_at: '2026-01-01T00:00:00Z',
    });
    const newerWaiting = row({
      id: 'newer',
      turn: 'black',
      white_player_id: 'u1',
      black_player_id: 'u3',
      updated_at: '2026-06-01T00:00:00Z',
    });
    const ordered = selectSeatedLiveRecoveryRows([newerWaiting, olderYourMove], 'u1').map((r) => r.id);
    expect(ordered).toEqual(['older', 'newer']);
    expect(src('components/free/LiveGameRecoveryBanner.tsx')).toContain('const game = rows[0]');
  });

  test('non-participant and signed-out get nothing', () => {
    const rows = [row({ id: 'a', white_player_id: 'u1', black_player_id: 'u2' })];
    expect(selectSeatedLiveRecoveryRows(rows, 'u3')).toEqual([]);
    expect(selectSeatedLiveRecoveryRows(rows, null)).toEqual([]);
  });

  test('board label is mode + exact time control', () => {
    expect(liveRecoveryBoardLabel({ tempo: 'live', live_time_control: '10m' })).toBe('Rapid 10M');
    expect(liveRecoveryBoardLabel({ tempo: 'live', live_time_control: '3+2' })).toContain('3+2'.toUpperCase());
  });

  test('CTA label is exactly "Return to live board" and routes to /game/{id}', () => {
    expect(LIVE_GAME_RECOVERY_RETURN_LABEL).toBe('Return to live board');
    const banner = src('components/free/LiveGameRecoveryBanner.tsx');
    expect(banner).toContain('Live game in progress');
    expect(banner).toContain('Your clock is running');
    expect(banner).toContain('href={`/game/${game.id}`}');
    expect(banner).toContain('data-testid="live-game-recovery-cta"');
    for (const banned of ['Resume games', 'Current games', 'Go to your game', 'Return to board']) {
      expect(banner).not.toContain(banned);
    }
    expect(banner).toContain('sticky');
  });

  test('hub mounts the banner with seated rows only; subsection keeps open seats', () => {
    const panel = src('components/free/FreeLobbyCurrentGamesPanel.tsx');
    expect(panel).toContain('<LiveGameRecoveryBanner');
    expect(panel).toContain('seatedLiveRecovery');
    expect(panel).toContain('freeLiveOpenSeats');
    expect(panel).toContain('isOpenSeatRow');
    expect(panel).not.toMatch(/GameContinuityGameRows rows=\{freeLive[^O]/);
  });

  test('mode room mounts the self-loading banner', () => {
    const modeRoom = src('components/free/FreeLobbyModeRoomContent.tsx');
    expect(modeRoom).toContain('SelfLoadingLiveGameRecoveryBanner');
  });

  test('tournament isolation: obligations free query excludes tournament rows', () => {
    const hook = src('hooks/useLobbyUserObligations.ts');
    expect(hook).toContain("eq('play_context', 'free')");
    expect(hook).toContain("is('tournament_id', null)");
    expect(hook).toContain("in('status', ['active', 'waiting'])");
  });
});
