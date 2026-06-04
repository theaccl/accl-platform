import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the merged public profile route — if prod still shows initials/legacy UI,
 * verify the deployed bundle includes this file and `data-profile-layout="v2"`.
 */
test.describe('public profile [id] layout (static)', () => {
  test('page uses v2 markers and auth gate before isSelf', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'profile', '[id]', 'page.tsx'), 'utf8');
    expect(src).toContain('data-profile-layout="v2"');
    expect(src).toContain('authReady');
    expect(src).toContain('ProfileHeader');
    expect(src).toContain('ProfileRatings');
    expect(src).toContain('ProfileActionSlot');
    expect(src).toContain('isSelf ?');
    expect(src).toContain('resolvePublicProfileIdFromRoute');
    expect(src).toContain('get_public_profile_snapshot');
    expect(src).toContain('flagCode={payload.profile.flag}');
  });

  test('ProfileHeader renders flag icon pill not plain text only', () => {
    const src = readFileSync(join(process.cwd(), 'components', 'profile', 'ProfileHeader.tsx'), 'utf8');
    expect(src).toContain('ProfileFlagPill');
    expect(src).toContain('resolveFlagIdentity');
    expect(src).not.toContain('flagDisplay:');
    expect(src).not.toContain('flagDisplay={');
  });

  test('country flag combobox uses prefer-not-to-say empty label', () => {
    const src = readFileSync(join(process.cwd(), 'components', 'profile', 'CountryFlagCombobox.tsx'), 'utf8');
    expect(src).toContain('FLAG_PREFER_NOT_TO_SAY_LABEL');
    expect(src).not.toContain('— None —');
    expect(src).not.toContain('Select country…');
  });
});
