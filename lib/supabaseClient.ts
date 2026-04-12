import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** One client per JS realm — avoids "Multiple GoTrueClient instances" when Turbopack re-evaluates the module. */
const globalForSupabase = globalThis as typeof globalThis & {
  __accl_supabase__?: SupabaseClient;
};

if (!globalForSupabase.__accl_supabase__) {
  globalForSupabase.__accl_supabase__ = createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = globalForSupabase.__accl_supabase__;

function isInvalidStoredSessionError(err: { message?: string } | null | undefined): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes('refresh token') ||
    m.includes('invalid jwt') ||
    m.includes('jwt expired')
  );
}

/** Drop broken persisted session so the client stops retrying refresh (see AuthApiError in dev logs). */
if (typeof window !== 'undefined') {
  void supabase.auth.getUser().then(async ({ error }) => {
    if (error && isInvalidStoredSessionError(error)) {
      await supabase.auth.signOut({ scope: 'local' });
    }
  });
}