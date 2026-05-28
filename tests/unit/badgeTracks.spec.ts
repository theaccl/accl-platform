import { test, expect } from '@playwright/test';

import {
  classifyFreeBadgeTrackKey,
  demotionDangerThreshold,
  isInDemotionDanger,
  rankBandFromSettlementRating,
} from '../../lib/badgeTracks';

test.describe('badge track classification', () => {
  test('maps exact PLAT clocks to track keys', () => {
    expect(classifyFreeBadgeTrackKey('live', '1+1')).toBe('bullet_1_1');
    expect(classifyFreeBadgeTrackKey('live', '2m')).toBe('bullet_2_0');
    expect(classifyFreeBadgeTrackKey('live', '2+0')).toBe('bullet_2_0');
    expect(classifyFreeBadgeTrackKey('live', '3+2')).toBe('blitz_3_2');
    expect(classifyFreeBadgeTrackKey('live', '30m')).toBe('rapid_30_0');
    expect(classifyFreeBadgeTrackKey('daily', '3d')).toBe('daily_3_day');
    expect(classifyFreeBadgeTrackKey('daily', '7d')).toBe('daily_7_day');
  });

  test('rejects tournament-style unknown clocks', () => {
    expect(classifyFreeBadgeTrackKey('live', '99m')).toBeNull();
  });
});

test.describe('badge rank bands', () => {
  test('C band danger threshold is 1375', () => {
    expect(demotionDangerThreshold(1400)).toBe(1375);
    expect(isInDemotionDanger(1375, 1400)).toBe(true);
    expect(isInDemotionDanger(1376, 1400)).toBe(false);
  });

  test('rating 1440 is band C', () => {
    expect(rankBandFromSettlementRating(1440)).toBe('c');
  });
});
