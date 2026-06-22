import type { SupabaseClient } from '@supabase/supabase-js';

import { ensureOwnProfileRow } from '@/lib/ensureOwnProfileRow';
import { resolveProfileUsernameClaimCas } from '@/lib/profileUsernameClaimCas';
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

  const cas = resolveProfileUsernameClaimCas((data as { username?: string | null }).username);
  if (!cas.eligible) {
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

  const ensured = await deps.ensureOwnProfileRow(supabase, userId);
  if (!ensured.ok) {
    if (ensured.error === 'profile_lookup_failed') {
      return json({ error: 'profile_lookup_failed' }, 503);
    }
    return json({ error: 'profile_provision_failed' }, 503);
  }

  const { data: profileRow, error: profileErr } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    return json({ error: 'profile_lookup_failed' }, 503);
  }
  if (!profileRow) {
    return json({ error: 'profile_provision_failed' }, 503);
  }

  const currentStoredUsername = (profileRow as { username?: string | null }).username;
  const cas = resolveProfileUsernameClaimCas(currentStoredUsername);
  if (!cas.eligible) {
    return json({ error: 'username_already_set' }, 409);
  }

  const { data: taken, error: takenErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', v.username)
    .neq('id', userId)
    .maybeSingle();

  if (takenErr) {
    return json({ error: 'profile_lookup_failed' }, 503);
  }
  if (taken?.id) {
    return json({ error: 'username_taken' }, 409);
  }

  let updateQuery = supabase
    .from('profiles')
    .update({ username: v.username })
    .eq('id', userId);

  if (cas.filter.kind === 'is_null') {
    updateQuery = updateQuery.is('username', null);
  } else {
    updateQuery = updateQuery.eq('username', cas.filter.username);
  }

  const { error: upErr, data: updated } = await updateQuery.select('id,username').maybeSingle();

  if (upErr) {
    if (String(upErr.code) === '23505') {
      return json({ error: 'username_taken' }, 409);
    }
    return json({ error: 'profile_provision_failed' }, 503);
  }

  if (!updated) {
    return classifyCasUpdateMiss(supabase, userId);
  }

  const { data: authUser, error: getErr } = await supabase.auth.admin.getUserById(userId);
  if (getErr || !authUser.user) {
    return json({ error: 'metadata_sync_failed', username: v.username }, 503);
  }

  const meta = { ...(authUser.user.user_metadata ?? {}), username: v.username };
  const { error: metaErr } = await supabase.auth.admin.updateUserById(userId, { user_metadata: meta });
  if (metaErr) {
    return json({ error: 'metadata_sync_failed', username: v.username }, 503);
  }

  auditApiLog('username_claim', { user: shortId(userId) });
  return json({ ok: true, username: v.username });
}
