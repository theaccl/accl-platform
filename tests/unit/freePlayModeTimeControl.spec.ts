import { expect, test } from '@playwright/test';

import { freePlayOptionsForMode } from '../../lib/acclTimeControls';
import {
  PLAT_MODE_TIME_OPTIONS,
  platSelectionToStoredGameFields,
  platTimeOptionsForMode,
} from '../../lib/freePlayModeTimeControl';

test.describe('freePlayModeTimeControl PLAT parity', () => {
  test('PLAT options match registry official free-play controls', () => {
    for (const mode of ['bullet', 'blitz', 'rapid', 'daily'] as const) {
      const registry = freePlayOptionsForMode(mode).map((o) => o.id);
      const plat = platTimeOptionsForMode(mode).map((o) => o.id);
      expect(plat).toEqual(registry);
    }
  });

  test('bullet includes 2m and labels avoid 2+0', () => {
    const bullet = PLAT_MODE_TIME_OPTIONS.bullet;
    expect(bullet.map((o) => o.id)).toEqual(['1m', '1+1', '2m', '2+1']);
    expect(bullet.find((o) => o.id === '2m')?.label).toBe('2');
    expect(bullet.some((o) => o.label === '2+2')).toBe(false);
  });

  test('rapid excludes legacy 20m', () => {
    const rapid = PLAT_MODE_TIME_OPTIONS.rapid.map((o) => o.id);
    expect(rapid).toEqual(['10m', '15m', '30m', '60m']);
    expect(rapid).not.toContain('20m');
  });

  test('rapid labels are clean no-increment', () => {
    const rapid = PLAT_MODE_TIME_OPTIONS.rapid;
    expect(rapid.map((o) => o.label)).toEqual(['10', '15', '30', '60']);
  });

  test('daily includes 7d', () => {
    expect(PLAT_MODE_TIME_OPTIONS.daily.map((o) => o.id)).toEqual(['1d', '2d', '3d', '7d']);
  });

  test('platSelectionToStoredGameFields stores 2m and 7d', () => {
    expect(platSelectionToStoredGameFields('bullet', '2m')).toEqual({
      tempo: 'live',
      live_time_control: '2m',
    });
    expect(platSelectionToStoredGameFields('daily', '7d')).toEqual({
      tempo: 'daily',
      live_time_control: '7d',
    });
  });
});
