import { expect, test } from '@playwright/test';

import {
  compareGameCategory,
  compareGamePickerPoints,
  mainCompareGameCategory,
} from '@/lib/profile/compareGamePicker';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

function point(id: string, track: string, gameId: string, mode: RatingHistoryPoint['mode'] = null): RatingHistoryPoint {
  return {
    id,
    playerId: 'player',
    ratingTrackId: track,
    ecosystem: 'free',
    mode,
    eventType: 'game',
    gameId,
    result: 'win',
    ratingBefore: 1500,
    ratingAfter: 1510,
    ratingDelta: 10,
    occurredAt: '2026-08-18T12:00:00Z',
  };
}

test('game categories prefer the broad family when ACCL and exact tracks repeat a game', () => {
  const accl = point('accl-1', 'accl', 'g-1', 'bullet');
  const exact = point('exact-1', 'free_bullet_1_0', 'g-1', 'bullet');
  const bullet = point('bullet-1', 'free_bullet', 'g-1', 'bullet');
  const games = compareGamePickerPoints({ accl: [accl], free_bullet_1_0: [exact], free_bullet: [bullet] });

  expect(games).toHaveLength(1);
  expect(games[0].id).toBe('bullet-1');
  expect(compareGameCategory(games[0])).toBe('free_bullet');
  expect(mainCompareGameCategory('free_bullet_1_0')).toBe('free_bullet');
});

test('unclassified ACCL history and administrative events do not enter a game family', () => {
  const unknown = point('unknown', 'accl', 'g-unknown');
  const adjustment = { ...point('adjustment', 'free_rapid', 'g-adjustment', 'rapid'), eventType: 'manual_admin_adjustment' as const };
  const tournament = { ...point('tournament', 'tournament', 'g-tournament', 'blitz'), ecosystem: 'tournament' as const };
  const games = compareGamePickerPoints({ accl: [unknown], free_rapid: [adjustment], tournament: [tournament] });

  expect(games.map((game) => game.id)).toEqual(['tournament']);
  expect(compareGameCategory(tournament)).toBe('tournament');
  expect(mainCompareGameCategory('accl')).toBeNull();
});
