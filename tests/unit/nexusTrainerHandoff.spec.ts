import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isValidNexusHubHref } from '@/lib/nexus/nexusHubMapping';

const NEXUS_COMPONENTS = [
  'OnboardingPanel.tsx',
  'PersonalHook.tsx',
  'LiveGamesModule.tsx',
  'StandingsExpanded.tsx',
] as const;

test.describe('Nexus stabilization handoffs (static)', () => {
  for (const file of NEXUS_COMPONENTS) {
    test(`${file} does not link to legacy /free/play`, () => {
      const src = readFileSync(join(process.cwd(), 'components', 'nexus', file), 'utf8');
      expect(src).not.toContain('href="/free/play"');
      expect(src).toContain('/free/lobby');
    });
  }

  test('hub action cards include Lobby Chat and Trainer review', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'nexus', 'nexusHubMapping.ts'), 'utf8');
    expect(src).toContain('href: "/free/lobby"');
    expect(src).toContain('href: "/trainer/review"');
    expect(src).not.toContain('href: "/free/play"');
  });

  test('hub href validator accepts trainer and lobby mode routes', () => {
    expect(isValidNexusHubHref('/free/lobby')).toBe(true);
    expect(isValidNexusHubHref('/free/lobby/blitz')).toBe(true);
    expect(isValidNexusHubHref('/trainer')).toBe(true);
    expect(isValidNexusHubHref('/trainer/review')).toBe(true);
    expect(isValidNexusHubHref('/trainer/computer')).toBe(true);
    expect(isValidNexusHubHref('/free/play')).toBe(false);
  });
});

test.describe('Trainer hub integration (static)', () => {
  test('trainer home links to Nexus and Lobby Chat', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'trainer', 'page.tsx'), 'utf8');
    expect(src).toContain('data-testid="trainer-arena-handoffs"');
    expect(src).toContain('data-testid="trainer-hub-nexus-link"');
    expect(src).toContain('href="/nexus"');
    expect(src).toContain('data-testid="trainer-hub-lobby-link"');
    expect(src).toContain('href="/free/lobby"');
  });
});
