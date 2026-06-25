import type { SupabaseClient } from '@supabase/supabase-js';

import { ensureOwnProfileRow } from '@/lib/ensureOwnProfileRow';
import { executeProfileUsernameClaim } from '@/lib/profileUsernameClaimCore';
import type { AuthenticatedUser } from '@/lib/requestAuth';
import { profileRowNeedsUsername } from '@/lib/usernameRules';

export const SIGNUP_USERNAME_CONFLICT_MESSAGE =
  'That username is no longer available. Choose a different public name to continue.';

export function readPendingSignupUsernameFromMetadata(user: AuthenticatedUser): string | null {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const raw = typeof meta?.username === 'string' ? meta.username.trim() : '';
  return raw || null;
}

export type PromotePendingSignupUsernameResult =
  | { status: 'promoted'; username: string }
  | { status: 'already_claimed'; username: string }
  | { status: 'none' }
  | { status: 'conflict'; reason: 'username_taken' | 'invalid_username' }
  | { status: 'error' };

/**
 * After verified login, promote signup metadata username into profiles.username once.
 * Idempotent when the profile already has a durable username.
 */
export async function tryPromotePendingSignupUsername(
  supabase: SupabaseClient,
  user: AuthenticatedUser,
  ensureRow: typeof ensureOwnProfileRow = ensureOwnProfileRow,
): Promise<PromotePendingSignupUsernameResult> {
  const { data, error } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
  if (error) {
    return { status: 'error' };
  }

  if (data) {
    const stored = (data as { username?: string | null }).username ?? null;
    if (!profileRowNeedsUsername(stored)) {
      const claimed = String(stored ?? '').trim();
      return { status: 'already_claimed', username: claimed };
    }
  }

  const pending = readPendingSignupUsernameFromMetadata(user);
  if (!pending) {
    return { status: 'none' };
  }

  const claim = await executeProfileUsernameClaim(supabase, user.id, pending, ensureRow);
  if (claim.ok) {
    return { status: 'promoted', username: claim.username };
  }

  if (claim.code === 'username_already_set') {
    return { status: 'already_claimed', username: claim.username };
  }
  if (claim.code === 'username_taken' || claim.code === 'invalid_username') {
    return {
      status: 'conflict',
      reason: claim.code === 'invalid_username' ? 'invalid_username' : 'username_taken',
    };
  }

  return { status: 'error' };
}
