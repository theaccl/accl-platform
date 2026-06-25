import type { User } from '@supabase/supabase-js';

import { isInvalidStoredSessionError, isTransientAuthNetworkError } from '@/lib/auth/sessionErrorClassification';
import { supabase } from '@/lib/supabaseClient';

export { isInvalidStoredSessionError, isTransientAuthNetworkError } from '@/lib/auth/sessionErrorClassification';

export type ValidatedClientAuthResult = {
  user: User | null;
  cleared: boolean;
};

/** Validate browser session with Supabase; clear local session when auth user is gone/invalid. */
export async function syncValidatedClientAuth(): Promise<ValidatedClientAuthResult> {
  const { data, error } = await supabase.auth.getUser();
  if (!error) {
    return { user: data.user ?? null, cleared: false };
  }

  if (isTransientAuthNetworkError(error)) {
    const { data: sess } = await supabase.auth.getSession();
    return { user: sess.session?.user ?? null, cleared: false };
  }

  if (isInvalidStoredSessionError(error)) {
    await supabase.auth.signOut({ scope: 'local' });
    return { user: null, cleared: true };
  }

  const { data: sess } = await supabase.auth.getSession();
  return { user: sess.session?.user ?? null, cleared: false };
}
