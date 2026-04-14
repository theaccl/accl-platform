import { expect, test } from '@playwright/test';
import type { User } from '@supabase/supabase-js';
import {
  identityPreviewFromUser,
  publicDisplayNameFromProfileUsername,
  publicDisplayNameFromUserMetadata,
  publicIdentityFromProfileUsername,
  PUBLIC_DISPLAY_FALLBACK,
  resolvePublicDisplayIdentity,
  sanitizePublicIdentityCandidate,
} from '../../lib/profileIdentity';

function mockUser(partial: Partial<User> & { id: string }): User {
  const { id, app_metadata, user_metadata, email, ...rest } = partial;
  return {
    ...rest,
    id,
    aud: 'authenticated',
    created_at: '',
    app_metadata: app_metadata ?? {},
    user_metadata: user_metadata ?? {},
    email,
  } as User;
}

test.describe('profileIdentity (no email in public display)', () => {
  test('identityPreviewFromUser never uses user.email as displayName', () => {
    const u = mockUser({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'leak_test@example.com',
      user_metadata: {},
    });
    const prev = identityPreviewFromUser(u);
    expect(prev.displayName).not.toBe(u.email);
    expect(prev.displayName).not.toContain('@');
    expect(prev.displayName).toBe(PUBLIC_DISPLAY_FALLBACK);
  });

  test('identityPreviewFromUser ignores JWT metadata when profile username absent', () => {
    const u1 = mockUser({
      id: '1',
      email: 'x@y.com',
      user_metadata: { username: 'alice', display_name: 'Alice D' },
    });
    expect(identityPreviewFromUser(u1).displayName).toBe(PUBLIC_DISPLAY_FALLBACK);

    const u2 = mockUser({
      id: '2',
      email: 'x@y.com',
      user_metadata: { display_name: 'Bob Only' },
    });
    expect(identityPreviewFromUser(u2).displayName).toBe(PUBLIC_DISPLAY_FALLBACK);
  });

  test('identityPreviewFromUser matches DB username when profileUsername provided', () => {
    const u = mockUser({
      id: '1',
      email: 'x@y.com',
      user_metadata: { username: 'jwt_only', display_name: 'Display Only' },
    });
    expect(identityPreviewFromUser(u, { profileUsername: 'dbuser' }).displayName).toBe('dbuser');
  });

  test('publicDisplayNameFromUserMetadata never used for display identity', () => {
    expect(publicDisplayNameFromUserMetadata({})).toBe(PUBLIC_DISPLAY_FALLBACK);
    expect(publicDisplayNameFromUserMetadata({ username: 'a' })).toBe(PUBLIC_DISPLAY_FALLBACK);
    expect(publicDisplayNameFromUserMetadata({ display_name: 'd' })).toBe(PUBLIC_DISPLAY_FALLBACK);
    expect(publicDisplayNameFromUserMetadata({ username: 'evil@test.com' })).toBe(PUBLIC_DISPLAY_FALLBACK);
    expect(publicDisplayNameFromUserMetadata({ display_name: 'Alias' }, 'alias@test.com')).toBe(
      PUBLIC_DISPLAY_FALLBACK,
    );
  });

  test('identityPreviewFromUser rejects metadata that looks like email', () => {
    const u = mockUser({
      id: '1',
      email: 'x@y.com',
      user_metadata: { username: 'oops@example.com', display_name: 'Also Bad <test@x.com>' },
    });
    expect(identityPreviewFromUser(u).displayName).toBe(PUBLIC_DISPLAY_FALLBACK);
  });

  test('identityPreviewFromUser prefers profile username over poisoned metadata', () => {
    const u = mockUser({
      id: '1',
      email: 'x@y.com',
      user_metadata: { username: 'oops@example.com' },
    });
    expect(identityPreviewFromUser(u, { profileUsername: 'safeuser' }).displayName).toBe('safeuser');
  });

  test('resolvePublicDisplayIdentity never returns user.email', () => {
    const u = mockUser({
      id: '1',
      email: 'only@email.com',
      user_metadata: {},
    });
    expect(resolvePublicDisplayIdentity({ profileUsername: null, user: u })).not.toBe(u.email);
    expect(resolvePublicDisplayIdentity({ profileUsername: null, user: u })).toBe(PUBLIC_DISPLAY_FALLBACK);
  });

  test('sanitizePublicIdentityCandidate strips email-like and full-email match', () => {
    expect(sanitizePublicIdentityCandidate('a@b.c', null)).toBeUndefined();
    expect(sanitizePublicIdentityCandidate('full@test.com', 'full@test.com')).toBeUndefined();
    expect(sanitizePublicIdentityCandidate('ok', null)).toBe('ok');
  });

  test('publicDisplayNameFromProfileUsername never returns email', () => {
    expect(publicDisplayNameFromProfileUsername(null)).toBe(PUBLIC_DISPLAY_FALLBACK);
    expect(publicDisplayNameFromProfileUsername('  ')).toBe(PUBLIC_DISPLAY_FALLBACK);
    expect(publicDisplayNameFromProfileUsername('carol')).toBe('carol');
    expect(publicDisplayNameFromProfileUsername('not@email')).toBe(PUBLIC_DISPLAY_FALLBACK);
  });

  test('publicDisplayNameFromProfileUsername rejects username equal to profile email local-part', () => {
    expect(publicDisplayNameFromProfileUsername('acme', undefined, 'acme@example.com')).toBe(
      PUBLIC_DISPLAY_FALLBACK,
    );
    expect(publicDisplayNameFromProfileUsername('safeuser', undefined, 'other@example.com')).toBe('safeuser');
  });

  test('publicIdentityFromProfileUsername matches sanitize + Player fallback', () => {
    expect(publicIdentityFromProfileUsername(null, 'a@b.com')).toBe(PUBLIC_DISPLAY_FALLBACK);
    expect(publicIdentityFromProfileUsername('realname', 'realname@gmail.com')).toBe(PUBLIC_DISPLAY_FALLBACK);
    expect(publicIdentityFromProfileUsername('alice', 'bob@gmail.com')).toBe('alice');
  });

  test('resolvePublicDisplayIdentity rejects DB username equal to session email local-part', () => {
    const u = mockUser({
      id: '1',
      email: 'john@gmail.com',
      user_metadata: {},
    });
    expect(resolvePublicDisplayIdentity({ profileUsername: 'john', user: u })).toBe(PUBLIC_DISPLAY_FALLBACK);
    expect(resolvePublicDisplayIdentity({ profileUsername: 'Johnny', user: u })).toBe('Johnny');
  });
});
