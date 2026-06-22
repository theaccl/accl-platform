import type { SupabaseClient } from '@supabase/supabase-js';

import { jsonResponse } from '@/lib/server/httpJson';
import { bearerToken } from '@/lib/server/matchRequestRouteAuth';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { formatMatchRequestApiError } from '@/lib/userFacingQueueError';

export type MatchRequestCancelRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  bearerToken: typeof bearerToken;
  createServiceRoleClient: typeof createServiceRoleClient;
};

const defaultDeps: MatchRequestCancelRouteDeps = {
  resolveAuthenticatedUser,
  bearerToken,
  createServiceRoleClient,
};

export async function matchRequestCancelPost(
  request: Request,
  deps: MatchRequestCancelRouteDeps = defaultDeps,
): Promise<Response> {
  const user = await deps.resolveAuthenticatedUser(request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!deps.bearerToken(request)) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: { requestId?: unknown };
  try {
    body = (await request.json()) as { requestId?: unknown };
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (!requestId) return jsonResponse({ error: 'requestId is required' }, 400);

  let serviceSupabase: SupabaseClient;
  try {
    serviceSupabase = deps.createServiceRoleClient();
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Server misconfigured' }, 500);
  }

  const { data: row, error: fetchErr } = await serviceSupabase
    .from('match_requests')
    .select('id, from_user_id, status')
    .eq('id', requestId)
    .maybeSingle();
  if (fetchErr) {
    console.warn('[match-requests.cancel] fetch failed', fetchErr.message);
    return jsonResponse({ error: formatMatchRequestApiError(fetchErr.message) }, 503);
  }
  if (!row) return jsonResponse({ error: 'Match request not found' }, 404);
  if (String(row.from_user_id ?? '') !== user.id) return jsonResponse({ error: 'Forbidden' }, 403);
  if (String(row.status ?? '') !== 'pending') {
    return jsonResponse({ error: 'This request is no longer pending.' }, 409);
  }

  const { data: updated, error: uErr } = await serviceSupabase
    .from('match_requests')
    .update({
      status: 'cancelled',
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .eq('from_user_id', user.id)
    .select('id');

  if (uErr) {
    console.warn('[match-requests.cancel] update failed', uErr.message);
    return jsonResponse({ error: formatMatchRequestApiError(uErr.message) }, 400);
  }
  const n = Array.isArray(updated) ? updated.length : updated ? 1 : 0;
  if (n === 0) {
    return jsonResponse({ error: 'This request is no longer pending.' }, 409);
  }

  return jsonResponse({ ok: true });
}
