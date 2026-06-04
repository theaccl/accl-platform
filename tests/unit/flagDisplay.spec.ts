import { expect, test } from '@playwright/test';

import {
  flagIconUrlFromIso2,
  formatFlagDisplay,
  resolveFlagIdentity,
} from '@/lib/flagDisplay';

test.describe('flagDisplay', () => {
  test('resolveFlagIdentity exposes PNG icon URL for ISO2 countries', () => {
    const us = resolveFlagIdentity('us');
    expect(us).toMatchObject({
      code: 'US',
      iconUrl: 'https://flagcdn.com/w40/us.png',
      label: 'United States of America',
    });
    expect(us?.emoji).toBeTruthy();

    const ca = resolveFlagIdentity('CA');
    expect(ca?.iconUrl).toBe('https://flagcdn.com/w40/ca.png');
    expect(ca?.label).toBe('Canada');
  });

  test('resolveFlagIdentity handles OTHER without icon', () => {
    expect(resolveFlagIdentity('OTHER')).toMatchObject({
      code: 'OTHER',
      label: 'Other / prefer not to say',
      iconUrl: null,
      emoji: null,
    });
  });

  test('flagIconUrlFromIso2 returns null for invalid codes', () => {
    expect(flagIconUrlFromIso2(null)).toBeNull();
    expect(flagIconUrlFromIso2('')).toBeNull();
    expect(flagIconUrlFromIso2('OTHER')).toBeNull();
    expect(flagIconUrlFromIso2('U')).toBeNull();
    expect(flagIconUrlFromIso2('USA')).toBeNull();
    expect(flagIconUrlFromIso2('U1')).toBeNull();
  });

  test('flagIconUrlFromIso2 lowercases validated ISO2 for CDN URL', () => {
    expect(flagIconUrlFromIso2('US')).toBe('https://flagcdn.com/w40/us.png');
    expect(flagIconUrlFromIso2('ca')).toBe('https://flagcdn.com/w40/ca.png');
  });

  test('formatFlagDisplay remains available for legacy string formatting', () => {
    const text = formatFlagDisplay('US');
    expect(text).toContain('United States');
  });
});
