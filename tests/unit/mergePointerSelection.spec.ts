import { expect, test } from '@playwright/test';

import { nearestMergePoint } from '../../lib/profile/mergePointerSelection';

test.describe('merged comparison pointer selection', () => {
  test('selects a closer lower-rank point even when a higher-rank hit area receives the click', () => {
    const main = { id: 'main', x: 100, y: 100, series: { rank: 1 } };
    const ct1 = { id: 'ct1', x: 106, y: 100, series: { rank: 2 } };
    expect(nearestMergePoint([main, ct1], 105, 100)?.id).toBe('ct1');
  });

  test('uses rank only to resolve an exact distance tie', () => {
    const ct1 = { id: 'ct1', x: 104, y: 100, series: { rank: 2 } };
    const main = { id: 'main', x: 100, y: 100, series: { rank: 1 } };
    expect(nearestMergePoint([ct1, main], 102, 100)?.id).toBe('main');
  });
});
