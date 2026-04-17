import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hubPath = join(process.cwd(), 'lib', 'nexus', 'getNexusHubData.ts');
const profilePath = join(process.cwd(), 'app', 'profile', 'page.tsx');
const identityPath = join(process.cwd(), 'lib', 'profileIdentity.ts');

test.describe('NEXUS / profile identity parity (static)', () => {
  test('NEXUS hub and /profile call identityPreviewFromUser with profiles.username', () => {
    const hub = readFileSync(hubPath, 'utf8');
    const profile = readFileSync(profilePath, 'utf8');
    expect(hub).toContain('identityPreviewFromUser(user, { profileUsername })');
    expect(hub).toContain('.from("profiles")');
    expect(hub).toMatch(/\.select\([^)]*\busername\b[^)]*\)/);
    expect(profile).toContain('identityPreviewFromUser(user, { profileUsername })');
    expect(profile).toContain('useProfileUsername');
  });

  test('resolvePublicDisplayIdentity is profiles.username only (no metadata fallback)', () => {
    const src = readFileSync(identityPath, 'utf8');
    const fnStart = src.indexOf('export function resolvePublicDisplayIdentity');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = src.indexOf('export function publicDisplayNameFromUserMetadata', fnStart);
    const body = src.slice(fnStart, fnEnd);
    expect(body).not.toContain('user_metadata');
    expect(body).not.toContain('pickMeta');
  });
});
