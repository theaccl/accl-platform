import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const editProfilePagePath = join(process.cwd(), 'app', 'profile', 'edit', 'page.tsx');
const calloutPath = join(process.cwd(), 'components', 'profile', 'ProfileUsernameCallout.tsx');

test.describe('/profile username callout (static)', () => {
  test('edit profile page shows labeled copyable username from profiles.username', () => {
    const pageSrc = readFileSync(editProfilePagePath, 'utf8');
    expect(pageSrc).toContain('ProfileUsernameCallout');
    expect(pageSrc).toContain('useProfileUsername');
    expect(pageSrc).toContain('username={profileUsername}');
    expect(pageSrc).toContain('accountEmail={user.email ?? null}');

    const c = readFileSync(calloutPath, 'utf8');
    expect(c).toContain('profile-username-callout');
    expect(c).toContain('navigator.clipboard.writeText');
    expect(c).toContain('/onboarding/username');
    expect(c).toContain('sanitizePublicIdentityCandidate');
    expect(c).toContain('publicIdentityFromProfileUsername');
    expect(c).not.toContain('user.email');
  });
});
