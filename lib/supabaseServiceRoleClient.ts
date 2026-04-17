import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fetchPolyfill from 'cross-fetch';
import { logBootConfigWarningsOnce } from '@/lib/runtimeConfigValidation';

logBootConfigWarningsOnce();

/** Decode Supabase JWT `role` claim without verifying the signature (shape check only). */
function supabaseJwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function assertLooksLikeServiceRoleKey(key: string): void {
  const role = supabaseJwtRole(key);
  if (role === 'anon') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is set to the anon (publishable) key. Use the service_role secret from Supabase → Project Settings → API (never NEXT_PUBLIC_ or anon).'
    );
  }
  if (role != null && role !== 'service_role') {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY JWT role is "${role}", expected "service_role". Replace it with the service_role secret from Supabase.`
    );
  }
}

/**
 * Supabase client with the **service role** key. Server-only — never import from client components.
 * Used for trusted workers (e.g. analysis queue API) that must bypass RLS.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.E2E_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      'Supabase URL and SUPABASE_SERVICE_ROLE_KEY are required for service-role access. Set NEXT_PUBLIC_SUPABASE_URL (or server-only SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (service_role secret, not anon).'
    );
  }
  assertLooksLikeServiceRoleKey(key);
  try {
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: fetchPolyfill as unknown as typeof fetch,
      },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[createServiceRoleClient] createClient failed', detail);
    throw new Error(`createServiceRoleClient failed: ${detail}`);
  }
}
