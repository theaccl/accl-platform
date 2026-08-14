import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ALBERT_FALLBACK_MODEL_IDS,
  ALBERT_MAX_MESSAGE_LENGTH,
  buildAlbertFallbackReply,
  buildAlbertSystemPrompt,
  classifyAlbertGatewayFailure,
  sanitizeAlbertReply,
  validateAlbertMessage,
} from '../../lib/albert/communication';

const nexusPagePath = join(process.cwd(), 'app', 'nexus', 'page.tsx');
const nexusLayoutPath = join(process.cwd(), 'components', 'nexus', 'NexusHubLayout.tsx');
const albertRoutePath = join(process.cwd(), 'app', 'api', 'albert', 'message', 'route.ts');

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

  test('uses the explicit Gateway provider with a current fallback model', () => {
    const route = readFileSync(albertRoutePath, 'utf8');

    expect(route).toContain('model: gateway(ALBERT_MODEL_ID)');
    expect(route).toContain('models: [...ALBERT_FALLBACK_MODEL_IDS]');
    expect(ALBERT_FALLBACK_MODEL_IDS).toEqual(['openai/gpt-5.6-sol']);
  });

  test('classifies Gateway failures without exposing prompt content', () => {
    expect(classifyAlbertGatewayFailure(new Error('OIDC token missing'), null)).toBe('authentication');
    expect(classifyAlbertGatewayFailure(new Error('request failed'), 402)).toBe('payment_required');
    expect(classifyAlbertGatewayFailure(new Error('request failed'), 429)).toBe('rate_limited');
    expect(classifyAlbertGatewayFailure(new Error('request timed out'), null)).toBe('timeout');
    expect(classifyAlbertGatewayFailure(new Error('model not found'), 404)).toBe('model_unavailable');
  });

  test('sanitizes empty and overlong provider output', () => {
    expect(sanitizeAlbertReply(null)).toBe('');
    expect(sanitizeAlbertReply(`  hello\u0000  `)).toBe('hello');
    expect(sanitizeAlbertReply('x'.repeat(2_000))).toHaveLength(1_200);
  });
});
