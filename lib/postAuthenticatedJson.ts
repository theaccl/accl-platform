import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-only helper: authenticated POST to a Next.js API route using the current session.
 */
export async function postAuthenticatedJson(
  supabase: SupabaseClient,
  path: string,
  body: unknown,
): Promise<Response> {
  if (typeof window === 'undefined') {
    throw new Error('postAuthenticatedJson is browser-only');
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return fetch(`${window.location.origin}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}
