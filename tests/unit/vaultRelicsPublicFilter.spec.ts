import { expect, test } from '@playwright/test';

import { filterPublicVaultRelics, isGenericFinishedGameWinRelic } from '@/lib/vaultRelicsPublicFilter';

test.describe('vaultRelicsPublicFilter', () => {
  test('filters generic finished-game winner relic', () => {
    const raw = [
      {
        id: '1',
        title: 'Game Winner',
        category: 'free' as const,
        description: 'Awarded for winning a finished game.',
        date_won: null,
        source_game_id: 'g1',
        source_tournament_id: null,
        pace: 'live' as const,
      },
      {
        id: '2',
        title: 'Tournament Champion',
        category: 'tournament' as const,
        description: 'First place.',
        date_won: null,
        source_game_id: null,
        source_tournament_id: null,
        pace: null,
      },
    ];
    const out = filterPublicVaultRelics(raw);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Tournament Champion');
  });

  test('isGenericFinishedGameWinRelic matches title and description', () => {
    expect(
      isGenericFinishedGameWinRelic({
        title: 'Game Winner',
        description: 'x',
      }),
    ).toBe(true);
    expect(
      isGenericFinishedGameWinRelic({
        title: 'Rare Coin',
        description: 'Awarded for winning a finished game.',
      }),
    ).toBe(true);
  });
});
