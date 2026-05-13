import { test, expect } from '@playwright/test';

import {
  tournamentOpsSecretConfigured,
  verifyTournamentOpsSecret,
} from '../../lib/internalTournamentOpsAuth';

/** Avoid parallel env mutation with other unit specs. */
test.describe.configure({ mode: 'serial' });

const KEY = 'ACCL_TOURNAMENT_OPS_SECRET';
let prev: string | undefined;

test.beforeAll(() => {
  prev = process.env[KEY];
});

test.afterAll(() => {
  if (prev === undefined) delete process.env[KEY];
  else process.env[KEY] = prev;
});

test('tournamentOpsSecretConfigured is false when secret is too short', () => {
  process.env[KEY] = 'fifteen-chars-1';
  expect(tournamentOpsSecretConfigured()).toBe(false);
  expect(
    verifyTournamentOpsSecret(new Request('http://x/', { headers: { 'x-accl-tournament-ops-secret': 'fifteen-chars-1' } })),
  ).toBe(false);
});

test('verifyTournamentOpsSecret accepts exact 16-char match (timing-safe compare)', () => {
  const secret = '0123456789abcdef';
  process.env[KEY] = secret;
  expect(tournamentOpsSecretConfigured()).toBe(true);
  const req = new Request('http://x/', { headers: { 'x-accl-tournament-ops-secret': secret } });
  expect(verifyTournamentOpsSecret(req)).toBe(true);
});

test('verifyTournamentOpsSecret rejects wrong secret same length', () => {
  process.env[KEY] = '0123456789abcdef';
  const req = new Request('http://x/', { headers: { 'x-accl-tournament-ops-secret': 'fedcba9876543210' } });
  expect(verifyTournamentOpsSecret(req)).toBe(false);
});
