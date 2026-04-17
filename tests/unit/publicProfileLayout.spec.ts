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
    expect(src).toContain('ProfileActionSlot');
    expect(src).toContain('public-profile-self-quicklinks');
    expect(src).toContain('isSelf ?');
    expect(src).toContain('search_public_profiles');
    expect(src).toContain('normalizeAcclUsername');
  });
});
