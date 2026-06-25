import type { SupabaseClient } from '@supabase/supabase-js';

import { ensureOwnProfileRow } from '@/lib/ensureOwnProfileRow';
import { executeProfileUsernameClaim } from '@/lib/profileUsernameClaimCore';
import { requiresEmailVerificationForProvisioning } from '@/lib/emailVerificationGate';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { validateAcclUsername } from '@/lib/usernameRules';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export type ClaimUsernameRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  createServiceRoleClient: typeof createServiceRoleClient;
  ensureOwnProfileRow: typeof ensureOwnProfileRow;
};

const defaultClaimUsernameRouteDeps: ClaimUsernameRouteDeps = {
  resolveAuthenticatedUser,
  createServiceRoleClient,
  ensureOwnProfileRow,
};

async function classifyCasUpdateMiss(
  supabase: SupabaseClient,
  userId: string,
): Promise<Response> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return json({ error: 'profile_lookup_failed' }, 503);
  }
  if (!data) {
    return json({ error: 'profile_provision_failed' }, 503);
  }

  const stored = (data as { username?: string | null }).username;
  if (stored?.trim()) {
    return json({ error: 'username_already_set' }, 409);
  }

  return json({ error: 'profile_provision_failed' }, 503);
}

/** Core claim-username handler; optional deps for focused unit tests. */
export async function claimUsernamePost(
  request: Request,
  deps: ClaimUsernameRouteDeps = defaultClaimUsernameRouteDeps,
): Promise<Response> {
  const user = await deps.resolveAuthenticatedUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  if (requiresEmailVerificationForProvisioning(user)) {
    return json({ error: 'email_verification_required' }, 403);
  }

  const userId = user.id;
  const rl = checkRateLimit(`claim-username:${userId}`, 15, 60_000);
  if (!rl.allowed) {
    return json({ error: 'rate_limited', retry_after_sec: rl.retryAfterSec }, 429);
  }

  let body: { username?: unknown };
  try {
    body = (await request.json()) as { username?: unknown };
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const raw = typeof body.username === 'string' ? body.username : '';
  const v = validateAcclUsername(raw);
  if (!v.ok) return json({ error: v.error }, 400);

  const supabase = deps.createServiceRoleClient();
  const claim = await executeProfileUsernameClaim(supabase, userId, raw, deps.ensureOwnProfileRow);

  if (claim.ok) {
    auditApiLog('username_claim', { user: shortId(userId) });
    return json({ ok: true, username: claim.username });
  }

  switch (claim.code) {
    case 'invalid_username':
      return json({ error: claim.message }, 400);
    case 'username_already_set':
      return json({ error: 'username_already_set' }, 409);
    case 'username_taken':
      return json({ error: 'username_taken' }, 409);
    case 'profile_lookup_failed':
      return json({ error: 'profile_lookup_failed' }, 503);
    case 'profile_provision_failed':
      return classifyCasUpdateMiss(supabase, userId);
    case 'metadata_sync_failed':
      return json({ error: 'metadata_sync_failed', username: claim.username }, 503);
    default:
      return json({ error: 'profile_provision_failed' }, 503);
  }
}
