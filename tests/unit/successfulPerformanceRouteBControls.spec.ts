import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SUCCESSFUL_PERFORMANCE_BROAD_MODES,
  SUCCESSFUL_PERFORMANCE_LEGACY_EXCLUDED_CONTROLS,
  SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS,
} from '../../lib/profile/successfulPerformanceRouteBControls';

test.describe('successfulPerformanceRouteBControls (frozen authority)', () => {
  test('frozen sets match locked RPC control sets', () => {
    expect(SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS).toEqual({
      bullet: ['1+0', '1+1', '2+0', '2+1'],
      blitz: ['3+0', '3+2', '5+0', '5+5'],
      rapid: ['10+0', '15+0', '30+0', '60+0'],
      daily: ['1d', '2d', '3d', '7d'],
    });
  });

  test('legacy 20+0 and 5d are excluded from frozen authority', () => {
    for (const mode of SUCCESSFUL_PERFORMANCE_BROAD_MODES) {
      const controls = SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS[mode];
      for (const legacy of SUCCESSFUL_PERFORMANCE_LEGACY_EXCLUDED_CONTROLS) {
        expect(controls).not.toContain(legacy);
      }
    }
  });

  test('frozen constants module does not import visibleTimeControlsForMode', () => {
    const constants = readFileSync(
      join(process.cwd(), 'lib/profile/successfulPerformanceRouteBControls.ts'),
      'utf8',
    );
    expect(constants).not.toContain('visibleTimeControlsForMode');
    expect(constants).not.toContain('acclTimeControls');
  });

  test('loader imports frozen constants instead of visibleTimeControlsForMode', () => {
    const loader = readFileSync(
      join(process.cwd(), 'lib/profile/loadOwnSuccessfulPerformance.ts'),
      'utf8',
    );
    expect(loader).toContain('SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS');
    expect(loader).not.toContain('visibleTimeControlsForMode');
  });
});
