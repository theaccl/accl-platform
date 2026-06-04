import { expect, test } from '@playwright/test';

import {
  FLAG_PREFER_NOT_TO_SAY_LABEL,
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
    expect(us.emoji).toBeTruthy();

    const ca = resolveFlagIdentity('CA');
    expect(ca.iconUrl).toBe('https://flagcdn.com/w40/ca.png');
    expect(ca.label).toBe('Canada');

    const hk = resolveFlagIdentity('HK');
    expect(hk.iconUrl).toBe('https://flagcdn.com/w40/hk.png');
    expect(hk.label).toBe('Hong Kong');
  });

  test('resolveFlagIdentity uses prefer-not-to-say label for null, empty, and OTHER', () => {
    for (const code of [null, '', '   ', 'OTHER'] as const) {
      const identity = resolveFlagIdentity(code);
      expect(identity.label).toBe(FLAG_PREFER_NOT_TO_SAY_LABEL);
      expect(identity.iconUrl).toBeNull();
      expect(identity.emoji).toBeNull();
    }
    expect(resolveFlagIdentity(null).code).toBe('');
    expect(resolveFlagIdentity('OTHER').code).toBe('OTHER');
  });

  test('flagIconUrlFromIso2 returns null for invalid and prefer-not-to-say codes', () => {
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
    expect(flagIconUrlFromIso2('HK')).toBe('https://flagcdn.com/w40/hk.png');
  });

  test('formatFlagDisplay remains available for legacy string formatting', () => {
    const text = formatFlagDisplay('US');
    expect(text).toContain('United States');
  });
});
