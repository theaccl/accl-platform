import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(p: string): string {
  return readFileSync(join(ROOT, p), 'utf8');
}

function walkTsFiles(dir: string, base: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walkTsFiles(full, base);
    } else if (name.endsWith('.tsx') || name.endsWith('.ts')) {
      base.push(full);
    }
  }
}

test.describe('identity privacy (static anti-patterns)', () => {
  test('NEXUS hub loads identity via identityPreviewFromUser + profile username', () => {
    const src = read('lib/nexus/getNexusHubData.ts');
    expect(src).toContain('identityPreviewFromUser');
    expect(src).toContain('profileUsername');
    expect(src).toContain('.from("profiles")');
  });

  test('NavigationBar uses profile username hook with identityPreviewFromUser', () => {
    const src = read('components/NavigationBar.tsx');
    expect(src).toContain('useProfileUsername');
    expect(src).toContain('identityPreviewFromUser(sessionUser, { profileUsername');
  });

  test('profile page uses profile username for identity preview', () => {
    const src = read('app/profile/page.tsx');
    expect(src).toContain('useProfileUsername');
    expect(src).toContain('identityPreviewFromUser(user, { profileUsername');
    expect(src).toContain('publicIdentityFromProfileUsername(profileUsername');
  });

  test('public profile by id uses publicIdentityFromProfileUsername (no raw username leak)', () => {
    const src = read('app/profile/[id]/page.tsx');
    expect(src).toContain('publicIdentityFromProfileUsername');
    expect(src).not.toMatch(/username\?\.trim\(\)\s*\|\|\s*['"]Player['"]/);
  });

  test('no split("@") in app/ or components/ (profileIdentity.ts allowed for dev-only guard)', () => {
    const files: string[] = [];
    walkTsFiles(join(ROOT, 'app'), files);
    walkTsFiles(join(ROOT, 'components'), files);
    const offenders: string[] = [];
    for (const full of files) {
      const rel = full.slice(ROOT.length + 1).replace(/\\/g, '/');
      const s = read(rel);
      if (s.includes('split("@")') || s.includes("split('@')")) {
        offenders.push(rel);
      }
    }
    expect(offenders, `split("@") used in: ${offenders.join(', ')}`).toEqual([]);
  });
});
