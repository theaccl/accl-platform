import { expect, test } from '@playwright/test';

import {
  ACCL_TIME_CONTROLS,
  freePlayOptionsForMode,
  visibleTimeControlsForMode,
} from '../../lib/acclTimeControls';

test.describe('ACCL time control registry', () => {
  test('each visible mode has four locked controls', () => {
    for (const mode of ['bullet', 'blitz', 'rapid', 'daily'] as const) {
      expect(visibleTimeControlsForMode(mode)).toHaveLength(4);
    }
  });

  test('no-increment bullet and rapid use clean display labels', () => {
    const bullet2 = ACCL_TIME_CONTROLS.find((t) => t.id === 'bullet_2_0');
    expect(bullet2?.displayValue).toBe('2');
    expect(bullet2?.normalizedValue).toBe('2+0');
    expect(bullet2?.label).toBe('2');

    const rapid10 = ACCL_TIME_CONTROLS.find((t) => t.id === 'rapid_10_0');
    expect(rapid10?.displayValue).toBe('10');
    expect(rapid10?.normalizedValue).toBe('10+0');
    expect(rapid10?.label).toBe('10');
  });

  test('does not include deprecated bullet 2+2 or rapid 10+5 labels', () => {
    const labels = ACCL_TIME_CONTROLS.map((t) => t.label);
    expect(labels).not.toContain('2+2');
    expect(labels).not.toContain('10+5');
    expect(labels).not.toContain('15+10');
  });

  test('daily visible controls include 7 days', () => {
    const daily = visibleTimeControlsForMode('daily').map((t) => t.displayValue);
    expect(daily).toEqual(['1 day', '2 days', '3 days', '7 days']);
  });

  test('sort order is stable within mode', () => {
    const bullet = visibleTimeControlsForMode('bullet');
    expect(bullet.map((t) => t.sortOrder)).toEqual([10, 20, 30, 40]);
  });

  test('future hidden control remains in registry', () => {
    const legacy = ACCL_TIME_CONTROLS.find((t) => t.id === 'rapid_20_0');
    expect(legacy?.isVisible).toBe(false);
    expect(legacy?.isActive).toBe(false);
    expect(legacy?.freePlayEligible).toBe(false);
  });

  test('official free-play eligible controls match locked list', () => {
    expect(freePlayOptionsForMode('bullet').map((o) => o.id)).toEqual(['1m', '1+1', '2m', '2+1']);
    expect(freePlayOptionsForMode('blitz').map((o) => o.id)).toEqual(['3m', '3+2', '5m', '5+5']);
    expect(freePlayOptionsForMode('rapid').map((o) => o.id)).toEqual(['10m', '15m', '30m', '60m']);
    expect(freePlayOptionsForMode('daily').map((o) => o.id)).toEqual(['1d', '2d', '3d', '7d']);
  });
});
