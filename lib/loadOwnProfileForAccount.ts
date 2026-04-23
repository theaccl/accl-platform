import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

export type OwnProfileRow = {
  username: string | null;
  bio: string | null;
  flag: string | null;
  avatar_path: string | null;
};

export type LoadOwnProfileResult =
  | { ok: true; profile: OwnProfileRow }
  | { ok: false; message: string };

/**
 * Load the signed-in user's `profiles` row for account/edit UIs.
 * If no row exists, inserts a minimal row (requires INSERT on `profiles` for `auth.uid()` — configure RLS in Supabase if needed).
 * Note: Do not replace global `profiles` SELECT RLS with "own row only" — many surfaces read other users' ids/usernames.
 */
export async function loadOrCreateOwnProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<LoadOwnProfileResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username,bio,flag,avatar_path')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, message: 'Failed to load profile' };
  }

  if (data) {
    return { ok: true, profile: data as OwnProfileRow };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      // Keep username empty until explicit claim/onboarding writes a validated value.
      username: null,
    })
    .select('username,bio,flag,avatar_path')
    .single();

  if (insertError) {
    return { ok: false, message: 'Failed to initialize profile' };
  }

  if (!inserted) {
    return { ok: false, message: 'Failed to initialize profile' };
  }

  return { ok: true, profile: inserted as OwnProfileRow };
}
