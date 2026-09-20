import { expect, test } from '@playwright/test';

import { consumeMagicLinkSession, magicLinkSessionFromHash } from '../../lib/auth/magicLinkSession';

const validHash = '#access_token=access-token&refresh_token=refresh-token&token_type=bearer&type=magiclink';

test('accepts only a complete magic-link session', () => {
  expect(magicLinkSessionFromHash(validHash)).toEqual({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
  });
  expect(magicLinkSessionFromHash('#access_token=access-token&refresh_token=refresh-token&type=recovery&token_type=bearer')).toBeNull();
  expect(magicLinkSessionFromHash('#access_token=access-token&type=magiclink&token_type=bearer')).toBeNull();
  expect(magicLinkSessionFromHash('#error=access_denied&type=magiclink')).toBeNull();
});

test('clears credentials before Supabase validates and stores the session', async () => {
  const actions: string[] = [];
  const result = await consumeMagicLinkSession(
    validHash,
    () => actions.push('clear'),
    async (tokens) => {
      actions.push(`validate:${tokens.access_token}`);
      return { error: null };
    },
  );
  expect(result).toBe('signed_in');
  expect(actions).toEqual(['clear', 'validate:access-token']);
});

test('a rejected session fails without retrying or exposing tokens', async () => {
  let cleared = 0;
  const result = await consumeMagicLinkSession(validHash, () => { cleared += 1; }, async () => ({ error: { message: 'invalid session' } }));
  expect(result).toBe('failed');
  expect(cleared).toBe(1);
});

test('unrelated URL fragments do not mutate the browser session', async () => {
  const result = await consumeMagicLinkSession('#type=recovery', () => { throw Error('unexpected clear'); }, async () => { throw Error('unexpected sign-in'); });
  expect(result).toBe('ignored');
});
