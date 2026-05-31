import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isLobbyYourMove, sortLobbyObligationRows } from '@/lib/lobbyObligationPresentation';

test.describe('lobby obligation presentation (unit)', () => {
  test('sorts your-move rows before waiting and by lower clock', () => {
    const uid = 'user-a';
    const sorted = sortLobbyObligationRows(
      [
        {
          id: '1',
          status: 'active',
          tempo: 'live',
          turn: 'black',
          white_player_id: 'other',
          black_player_id: uid,
          white_clock_ms: 60_000,
          black_clock_ms: 5_000,
          updated_at: '2026-01-02T00:00:00Z',
        },
        {
          id: '2',
          status: 'active',
          tempo: 'live',
          turn: 'white',
          white_player_id: uid,
          black_player_id: 'other',
          white_clock_ms: 2_000,
          black_clock_ms: 90_000,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      uid,
    );
    expect(sorted.map((r) => r.id)).toEqual(['2', '1']);
    expect(isLobbyYourMove(sorted[0]!, uid)).toBe(true);
  });

  test('hub removes sticky bar and orders obligations before mode filter feeds', () => {
    const hub = readFileSync(join(process.cwd(), 'components', 'free', 'FreeLobbyHubContent.tsx'), 'utf8');
    const panel = readFileSync(join(process.cwd(), 'components', 'free', 'FreeLobbyCurrentGamesPanel.tsx'), 'utf8');
    expect(hub).not.toContain('NexusLobbyActionsBar');
    expect(hub.indexOf('FreeLobbyCurrentGamesPanel')).toBeLessThan(hub.indexOf('FreeLobbyModeFilterStrip'));
    expect(hub.indexOf('FreeLobbyModeFilterStrip')).toBeLessThan(hub.indexOf('FreeLobbySpectatorFeed'));
    expect(hub).toContain('FreeLobbyModeFilterStrip');
    const strip = readFileSync(join(process.cwd(), 'components', 'free', 'FreeLobbyModeFilterStrip.tsx'), 'utf8');
    expect(strip).toContain('ModeFilterCard');
    expect(strip).toContain('data-mode-filter-selected');
    expect(strip).toContain('open-seats-pulse');
    expect(strip).toContain('openSeatObligationByMode');
    expect(hub).toContain('countYourMoveByPlatMode');
    expect(hub).toContain('countOwnOpenLiveSeatsByPlatMode');
    const spectator = readFileSync(join(process.cwd(), 'components', 'free', 'FreeLobbySpectatorFeed.tsx'), 'utf8');
    expect(spectator).toContain('free-watch-link-');
    expect(spectator).toContain('grid-cols-2');
    expect(spectator).toContain('bg-violet-400');
    expect(panel).toContain('free-lobby-your-move-heading');
    expect(panel).toContain('free-lobby-tournament-live');
  });
});
