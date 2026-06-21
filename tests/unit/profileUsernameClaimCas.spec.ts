import { expect, test } from '@playwright/test';

import { resolveProfileUsernameClaimCas } from '../../lib/profileUsernameClaimCas';

test.describe('profileUsernameClaimCas', () => {
  test('SQL null produces the null CAS branch', () => {
    expect(resolveProfileUsernameClaimCas(null)).toEqual({
      eligible: true,
      filter: { kind: 'is_null' },
    });
  });

  test('undefined produces the null CAS branch', () => {
    expect(resolveProfileUsernameClaimCas(undefined)).toEqual({
      eligible: true,
      filter: { kind: 'is_null' },
    });
  });

  test('empty string produces exact-value CAS', () => {
    expect(resolveProfileUsernameClaimCas('')).toEqual({
      eligible: true,
      filter: { kind: 'eq', username: '' },
    });
  });

  test('whitespace-only value produces exact-value CAS using original stored value', () => {
    const stored = '   ';
    expect(resolveProfileUsernameClaimCas(stored)).toEqual({
      eligible: true,
      filter: { kind: 'eq', username: stored },
    });
  });

  test('repository-recognized generated fallback produces exact-value CAS', () => {
    const stored = 'player_e84bd3f2';
    expect(resolveProfileUsernameClaimCas(stored)).toEqual({
      eligible: true,
      filter: { kind: 'eq', username: stored },
    });
  });

  test('real claimed username is ineligible and produces no CAS mutation instruction', () => {
    expect(resolveProfileUsernameClaimCas('alice')).toEqual({
      eligible: false,
      reason: 'already_claimed',
    });
  });
});
