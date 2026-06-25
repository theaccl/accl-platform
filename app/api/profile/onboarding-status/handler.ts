import { requiresEmailVerificationForProvisioning } from '@/lib/emailVerificationGate';
import {
  SIGNUP_USERNAME_CONFLICT_MESSAGE,
  tryPromotePendingSignupUsername,
} from '@/lib/promotePendingSignupUsername';
import { resolveAuthenticatedUser, type AuthenticatedUser } from '@/lib/requestAuth';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { profileRowNeedsUsername } from '@/lib/usernameRules';
import { ensureOwnProfileRow } from '@/lib/ensureOwnProfileRow';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export type OnboardingStatusRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  createServiceRoleClient: typeof createServiceRoleClient;
  ensureOwnProfileRow: typeof ensureOwnProfileRow;
  tryPromotePendingSignupUsername: typeof tryPromotePendingSignupUsername;
};

const defaultOnboardingStatusRouteDeps: OnboardingStatusRouteDeps = {
  resolveAuthenticatedUser,
  createServiceRoleClient,
  ensureOwnProfileRow,
  tryPromotePendingSignupUsername,
};

async function resolveUsernameState(
  user: AuthenticatedUser,
  deps: OnboardingStatusRouteDeps,
): Promise<{
  needsUsername: boolean;
  profileExists: boolean;
  username: string | null;
  signupUsernameConflict?: boolean;
  signupUsernameConflictMessage?: string;
}> {
  const supabase = deps.createServiceRoleClient();
  const promotion = await deps.tryPromotePendingSignupUsername(supabase, user, deps.ensureOwnProfileRow);

  if (promotion.status === 'promoted' || promotion.status === 'already_claimed') {
    return {
      needsUsername: false,
      profileExists: true,
      username: promotion.username,
    };
  }

  if (promotion.status === 'conflict') {
    return {
      needsUsername: true,
      profileExists: true,
      username: null,
      signupUsernameConflict: true,
      signupUsernameConflictMessage: SIGNUP_USERNAME_CONFLICT_MESSAGE,
    };
  }

  const { data, error } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
  if (error) {
    throw new Error('profile_lookup_failed');
  }

  if (!data) {
    return {
      needsUsername: true,
      profileExists: false,
      username: null,
    };
  }

  const storedUsername = (data as { username?: string | null }).username ?? null;
  const needsUsername = profileRowNeedsUsername(storedUsername);
  return {
    needsUsername,
    profileExists: true,
    username: needsUsername ? null : storedUsername?.trim() || null,
  };
}

/** Core onboarding-status handler; optional deps for focused unit tests. */
export async function onboardingStatusGet(
  request: Request,
  deps: OnboardingStatusRouteDeps = defaultOnboardingStatusRouteDeps,
): Promise<Response> {
  const user = await deps.resolveAuthenticatedUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  if (requiresEmailVerificationForProvisioning(user)) {
    return json({
      needsEmailVerification: true,
      needsUsername: true,
      profileExists: false,
      username: null,
    });
  }

  const userId = user.id;
  try {
    const state = await resolveUsernameState(user, deps);
    return json({
      needsEmailVerification: false,
      ...state,
    });
  } catch {
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
}
