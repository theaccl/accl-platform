import type { SupabaseClient } from '@supabase/supabase-js';

import { ensureOwnProfileRow } from '@/lib/ensureOwnProfileRow';
import { resolveProfileUsernameClaimCas } from '@/lib/profileUsernameClaimCas';
import { validateAcclUsername } from '@/lib/usernameRules';

export type ProfileUsernameClaimResult =
  | { ok: true; username: string }
  | { ok: false; code: 'invalid_username'; message: string }
  | { ok: false; code: 'username_already_set'; username: string }
  | { ok: false; code: 'username_taken' }
  | { ok: false; code: 'profile_lookup_failed' }
  | { ok: false; code: 'profile_provision_failed' }
  | { ok: false; code: 'metadata_sync_failed'; username: string };

/** Authoritative server-side username claim for a verified user (CAS + metadata sync). */
export async function executeProfileUsernameClaim(
  supabase: SupabaseClient,
  userId: string,
  rawUsername: string,
  ensureRow: typeof ensureOwnProfileRow = ensureOwnProfileRow,
): Promise<ProfileUsernameClaimResult> {
  const v = validateAcclUsername(rawUsername);
  if (!v.ok) {
    return { ok: false, code: 'invalid_username', message: v.error };
  }

  const ensured = await ensureRow(supabase, userId);
  if (!ensured.ok) {
    return {
      ok: false,
      code: ensured.error === 'profile_lookup_failed' ? 'profile_lookup_failed' : 'profile_provision_failed',
    };
  }

  const { data: profileRow, error: profileErr } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    return { ok: false, code: 'profile_lookup_failed' };
  }
  if (!profileRow) {
    return { ok: false, code: 'profile_provision_failed' };
  }

  const currentStoredUsername = (profileRow as { username?: string | null }).username;
  const cas = resolveProfileUsernameClaimCas(currentStoredUsername);
  if (!cas.eligible) {
    const existing = currentStoredUsername?.trim() || v.username;
    return { ok: false, code: 'username_already_set', username: existing };
  }

  const { data: taken, error: takenErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', v.username)
    .neq('id', userId)
    .maybeSingle();

  if (takenErr) {
    return { ok: false, code: 'profile_lookup_failed' };
  }
  if (taken?.id) {
    return { ok: false, code: 'username_taken' };
  }

  let updateQuery = supabase.from('profiles').update({ username: v.username }).eq('id', userId);

  if (cas.filter.kind === 'is_null') {
    updateQuery = updateQuery.is('username', null);
  } else {
    updateQuery = updateQuery.eq('username', cas.filter.username);
  }

  const { error: upErr, data: updated } = await updateQuery.select('id,username').maybeSingle();

  if (upErr) {
    if (String(upErr.code) === '23505') {
      return { ok: false, code: 'username_taken' };
    }
    return { ok: false, code: 'profile_provision_failed' };
  }

  if (!updated) {
    return { ok: false, code: 'profile_provision_failed' };
  }

  const { data: authUser, error: getErr } = await supabase.auth.admin.getUserById(userId);
  if (getErr || !authUser.user) {
    return { ok: false, code: 'metadata_sync_failed', username: v.username };
  }

  const meta = { ...(authUser.user.user_metadata ?? {}), username: v.username };
  const { error: metaErr } = await supabase.auth.admin.updateUserById(userId, { user_metadata: meta });
  if (metaErr) {
    return { ok: false, code: 'metadata_sync_failed', username: v.username };
  }

  return { ok: true, username: v.username };
}
