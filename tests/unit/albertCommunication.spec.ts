import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ALBERT_MAX_MESSAGE_LENGTH,
  buildAlbertFallbackReply,
  buildAlbertSystemPrompt,
  sanitizeAlbertReply,
  validateAlbertMessage,
} from '../../lib/albert/communication';

const nexusPagePath = join(process.cwd(), 'app', 'nexus', 'page.tsx');
const nexusLayoutPath = join(process.cwd(), 'components', 'nexus', 'NexusHubLayout.tsx');

test.describe('Albert communication boundary', () => {
  test('accepts a trimmed bounded message', () => {
    expect(validateAlbertMessage('  Hi Albert  ')).toEqual({ ok: true, value: 'Hi Albert' });
  });

  test('rejects blank and oversized messages', () => {
    expect(validateAlbertMessage('   ')).toMatchObject({ ok: false, code: 'message_required' });
    expect(validateAlbertMessage('x'.repeat(ALBERT_MAX_MESSAGE_LENGTH + 1))).toMatchObject({
      ok: false,
      code: 'message_too_long',
    });
  });

  test('keeps Albert advisory-only and excludes live move authority', () => {
    const policy = buildAlbertSystemPrompt().toLowerCase();
    expect(policy).toContain('no access to live boards');
    expect(policy).toContain('never provide position-specific move recommendations');
    expect(policy).toContain('never claim that you changed a game');
  });

  test('gates panel visibility with the authenticated ecosystem', () => {
    const page = readFileSync(nexusPagePath, 'utf8');
    const layout = readFileSync(nexusLayoutPath, 'utf8');

    expect(page).toContain('resolveUserNexusEcosystemFromAuthMetadata(user) === "adult"');
    expect(page).toContain('<NexusShell data={data} showAlbert={showAlbert} />');
    expect(layout).toContain('{showAlbert ? (');
    expect(layout).not.toContain('data.meta.ecosystem === "adult"');
  });

  test('provides a truthful greeting when the model service is degraded', () => {
    const fallback = buildAlbertFallbackReply('Hello Albert').toLowerCase();
    expect(fallback).toContain('hi');
    expect(fallback).toContain('advisory assistant');
    expect(fallback).toContain('cannot alter games');
  });

  test('sanitizes empty and overlong provider output', () => {
    expect(sanitizeAlbertReply(null)).toBe('');
    expect(sanitizeAlbertReply(`  hello\u0000  `)).toBe('hello');
    expect(sanitizeAlbertReply('x'.repeat(2_000))).toHaveLength(1_200);
  });
});
