import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ALBERT_DEFAULT_MODEL_ID,
  ALBERT_FALLBACK_TIMEOUT_MS,
  ALBERT_FALLBACK_MODEL_IDS,
  ALBERT_MAX_MESSAGE_LENGTH,
  ALBERT_PRIMARY_TIMEOUT_MS,
  buildAlbertFallbackReply,
  buildAlbertModelAttempts,
  buildAlbertSystemPrompt,
  classifyAlbertGatewayFailure,
  sanitizeAlbertReply,
  validateAlbertMessage,
} from '../../lib/albert/communication';

const nexusPagePath = join(process.cwd(), 'app', 'nexus', 'page.tsx');
const nexusLayoutPath = join(process.cwd(), 'components', 'nexus', 'NexusHubLayout.tsx');
const albertRoutePath = join(process.cwd(), 'app', 'api', 'albert', 'message', 'route.ts');
const albertHandlerPath = join(process.cwd(), 'app', 'api', 'albert', 'message', 'handler.ts');

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

  test('gives Albert a chess identity while excluding player and live move authority', () => {
    const policy = buildAlbertSystemPrompt().toLowerCase();
    expect(policy).toContain('personal chess assistant and mentor');
    expect(policy).toContain('lifelong student of chess');
    expect(policy).toContain('study and enjoy playing chess');
    expect(policy).toContain('never claim an actual accl player account');
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
    expect(fallback).toContain('personal chess assistant and mentor');
    expect(fallback).toContain('lifelong student of chess');
    expect(fallback).toContain('cannot alter games');
  });

  test('uses bounded explicit Gateway attempts with reserved fallback time', () => {
    const route = readFileSync(albertRoutePath, 'utf8');
    const handler = readFileSync(albertHandlerPath, 'utf8');

    expect(route).toContain('handleAlbertMessage(request)');
    expect(handler).toContain('model: gateway(input.modelId)');
    expect(handler).toContain('timeout: { totalMs: input.timeoutMs }');
    expect(handler).toContain('maxRetries: 0');
    expect(ALBERT_DEFAULT_MODEL_ID).toBe('deepseek/deepseek-v4-pro-0813');
    expect(ALBERT_FALLBACK_MODEL_IDS).toEqual(['xai/grok-4.6']);
    expect(buildAlbertModelAttempts()).toEqual([
      { modelId: ALBERT_DEFAULT_MODEL_ID, timeoutMs: ALBERT_PRIMARY_TIMEOUT_MS },
      { modelId: 'xai/grok-4.6', timeoutMs: ALBERT_FALLBACK_TIMEOUT_MS },
    ]);
    expect(ALBERT_PRIMARY_TIMEOUT_MS).toBeLessThan(ALBERT_FALLBACK_TIMEOUT_MS);
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
