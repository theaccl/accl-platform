import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { profileRowNeedsUsername, validateAcclUsername } from '@/lib/usernameRules';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

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

  const supabase = createServiceRoleClient();

  const { data: mine, error: mineErr } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();

  if (mineErr) return json({ error: 'profile_lookup_failed' }, 503);
  const current = (mine as { username?: string | null } | null)?.username ?? null;
  if (!profileRowNeedsUsername(current)) {
    return json({ error: 'username_already_set' }, 409);
  }

  const { data: taken } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', v.username)
    .neq('id', userId)
    .maybeSingle();

  if (taken?.id) {
    return json({ error: 'username_taken' }, 409);
  }

  const { error: upErr, data: updated } = await supabase
    .from('profiles')
    .update({ username: v.username })
    .eq('id', userId)
    .select('id,username')
    .maybeSingle();

  if (upErr) {
    if (/duplicate|unique|23505/i.test(upErr.message)) {
      return json({ error: 'username_taken' }, 409);
    }
    return json({ error: upErr.message }, 503);
  }

  if (!updated) {
    return json({ error: 'profile_not_found' }, 503);
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
