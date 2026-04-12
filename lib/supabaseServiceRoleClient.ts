import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fetchPolyfill from 'cross-fetch';
import { logBootConfigWarningsOnce } from '@/lib/runtimeConfigValidation';

logBootConfigWarningsOnce();

/**
 * Supabase client with the **service role** key. Server-only — never import from client components.
 * Used for trusted workers (e.g. analysis queue API) that must bypass RLS.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.E2E_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for service-role access.'
    );
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: fetchPolyfill as unknown as typeof fetch,
    },
  });
}
