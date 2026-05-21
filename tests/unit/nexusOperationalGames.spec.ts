import { test, expect } from '@playwright/test';

import {
  groupOperationalGamesByMode,
  sortOperationalRows,
  type NexusOperationalGameRow,
} from '@/lib/nexus/getUserOperationalGames';

function row(partial: Partial<NexusOperationalGameRow> & { id: string }): NexusOperationalGameRow {
  return {
    href: `/game/${partial.id}`,
    mode: null,
    tempoLabel: '5+0',
    isLive: false,
    isYourMove: false,
    isTournament: false,
    clockRemainingMs: null,
    opponentLabel: 'opp',
    status: 'active',
    ...partial,
  };
}

test.describe('NEXUS operational game ordering', () => {
  test('your move first, then live, then ascending clock', () => {
    const sorted = sortOperationalRows([
      row({ id: 'b', isYourMove: false, isLive: true, clockRemainingMs: 120_000 }),
      row({ id: 'a', isYourMove: true, isLive: false, clockRemainingMs: null }),
      row({ id: 'c', isYourMove: false, isLive: true, clockRemainingMs: 30_000 }),
      row({ id: 'd', isYourMove: false, isLive: false, clockRemainingMs: null }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  test('groupOperationalGamesByMode omits empty lanes', () => {
    const grouped = groupOperationalGamesByMode([
      row({ id: '1', mode: 'bullet' }),
      row({ id: '2', mode: 'bullet' }),
    ]);
    expect(Object.keys(grouped)).toEqual(['bullet']);
    expect(grouped.blitz).toBeUndefined();
  });
});

test.describe('NEXUS hub wiring (static)', () => {
  test('getNexusHubData exposes operationalGames', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'lib', 'nexus', 'getNexusHubData.ts'), 'utf8');
    expect(src).toContain('getUserOperationalGamesForNexus');
    expect(src).toContain('operationalGames');
  });

  test('NexusOpenGamesColumn hides when logged out or empty', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const col = readFileSync(
      join(process.cwd(), 'components', 'nexus', 'NexusOpenGamesColumn.tsx'),
      'utf8',
    );
    const layout = readFileSync(
      join(process.cwd(), 'components', 'nexus', 'NexusHubLayout.tsx'),
      'utf8',
    );
    expect(col).toContain('return null');
    expect(col).toContain('populatedModes');
    expect(layout).toContain('operationalGames');
  });
});
