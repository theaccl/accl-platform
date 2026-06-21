import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { profileRowNeedsUsername } from '@/lib/usernameRules';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export type OnboardingStatusRouteDeps = {
  resolveAuthenticatedUserId: typeof resolveAuthenticatedUserId;
  createServiceRoleClient: typeof createServiceRoleClient;
};

const defaultOnboardingStatusRouteDeps: OnboardingStatusRouteDeps = {
  resolveAuthenticatedUserId,
  createServiceRoleClient,
};

/** Core onboarding-status handler; optional deps for focused unit tests. */
export async function onboardingStatusGet(
  request: Request,
  deps: OnboardingStatusRouteDeps = defaultOnboardingStatusRouteDeps,
): Promise<Response> {
  const userId = await deps.resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const supabase = deps.createServiceRoleClient();
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

  if (!data) {
    return json({
      needsUsername: true,
      profileExists: false,
      username: null,
    });
  }

  const storedUsername = (data as { username?: string | null }).username ?? null;
  const needsUsername = profileRowNeedsUsername(storedUsername);
  return json({
    needsUsername,
    profileExists: true,
    username: needsUsername ? null : storedUsername?.trim() || null,
  });
}
