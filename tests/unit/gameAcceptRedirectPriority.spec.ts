import { test, expect } from '@playwright/test';

import {
  getTempoType,
  parseGameIdFromPath,
  shouldRedirectOnAccept,
} from '../../lib/gameAcceptRedirectPriority';

test.describe('gameAcceptRedirectPriority', () => {
  test('parseGameIdFromPath', () => {
    expect(parseGameIdFromPath('/game/abc-123')).toBe('abc-123');
    expect(parseGameIdFromPath('/game/abc-123?join=1')).toBe('abc-123');
    expect(parseGameIdFromPath('/requests')).toBeNull();
  });

  test('getTempoType: live and daily exact; else correspondence', () => {
    expect(getTempoType({ tempo: 'live' })).toBe('live');
    expect(getTempoType({ tempo: 'daily' })).toBe('daily');
    expect(getTempoType({ tempo: 'correspondence' })).toBe('correspondence');
    expect(getTempoType({ tempo: null })).toBe('correspondence');
    expect(getTempoType({ tempo: 'anything-else' })).toBe('correspondence');
  });

  test('1) live current + accept daily => no redirect', () => {
    expect(shouldRedirectOnAccept({ tempo: 'live' }, { tempo: 'daily' })).toBe(false);
  });

  test('2) daily current + accept live => redirect', () => {
    expect(shouldRedirectOnAccept({ tempo: 'daily' }, { tempo: 'live' })).toBe(true);
  });

  test('3) no active game => accept any => redirect', () => {
    expect(shouldRedirectOnAccept(null, { tempo: 'daily' })).toBe(true);
    expect(shouldRedirectOnAccept(null, { tempo: 'correspondence' })).toBe(true);
    expect(shouldRedirectOnAccept(null, { tempo: 'live' })).toBe(true);
  });

  test('correspondence current + accept daily => redirect', () => {
    expect(shouldRedirectOnAccept({ tempo: 'correspondence' }, { tempo: 'daily' })).toBe(true);
  });
});
