import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { profileRowNeedsUsername } from '@/lib/usernameRules';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
  if (error) {
    auditApiLog('profile_onboarding_status', { result: 'lookup_failed', user: shortId(userId) });
    return json(
      {
        needsUsername: true,
        username: null,
        error: 'profile_unavailable',
        message: 'Could not verify your profile. Try again in a moment.',
      },
      503,
    );
  }
  const username = (data as { username?: string | null } | null)?.username ?? null;
  return json({
    needsUsername: profileRowNeedsUsername(username),
    username: username?.trim() || null,
  });
}
