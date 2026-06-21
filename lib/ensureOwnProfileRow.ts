import type { SupabaseClient } from '@supabase/supabase-js';

import { minimalProfileInsertRow } from '@/lib/profileProvisioningContract';

export type EnsureOwnProfileRowSuccess =
  | { ok: true; existed: true }
  | { ok: true; existed: false };

export type EnsureOwnProfileRowFailure =
  | { ok: false; error: 'profile_lookup_failed'; detail?: string }
  | { ok: false; error: 'profile_provision_failed'; detail?: string };

export type EnsureOwnProfileRowResult = EnsureOwnProfileRowSuccess | EnsureOwnProfileRowFailure;

type ProfileIdLookupResult =
  | { ok: true; exists: boolean }
  | { ok: false; error: 'profile_lookup_failed'; detail?: string };

async function lookupProfileId(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileIdLookupResult> {
  const { data, error } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();

  if (error) {
    return { ok: false, error: 'profile_lookup_failed', detail: error.message };
  }

  return { ok: true, exists: Boolean((data as { id?: string } | null)?.id) };
}

/**
 * Server-side: ensure `profiles` row exists for the authenticated user id.
 * Does not resolve auth, claim usernames, or sync auth metadata.
 */
export async function ensureOwnProfileRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnsureOwnProfileRowResult> {
  const initial = await lookupProfileId(supabase, userId);
  if (!initial.ok) {
    return initial;
  }
  if (initial.exists) {
    return { ok: true, existed: true };
  }

  const { error: insertError } = await supabase.from('profiles').insert(minimalProfileInsertRow(userId));

  if (!insertError) {
    return { ok: true, existed: false };
  }

  if (String(insertError.code) === '23505') {
    const reread = await lookupProfileId(supabase, userId);
    if (!reread.ok) {
      return reread;
    }
    if (reread.exists) {
      return { ok: true, existed: true };
    }
    return { ok: false, error: 'profile_provision_failed', detail: insertError.message };
  }

  return { ok: false, error: 'profile_provision_failed', detail: insertError.message };
}
