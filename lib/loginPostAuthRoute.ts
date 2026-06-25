import { getSafePostLoginRedirect } from '@/lib/nexus/nexusRouteHelpers';
import { getStoredEntrySource, getStoredReferral } from '@/lib/public/referralTracking';
import {
  requiresEmailVerificationForProvisioning,
  type EmailVerificationUser,
} from '@/lib/emailVerificationGate';

async function attachGrowthProfile(accessToken: string): Promise<void> {
  try {
    await fetch('/api/public/attach-growth-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        referral_id: getStoredReferral() ?? undefined,
        entry_source: getStoredEntrySource(),
        conversion_event: 'session',
      }),
    });
  } catch {
    /* non-blocking */
  }
}

export type PostAuthRouteResult =
  | { status: 'redirect'; destination: string }
  | { status: 'verification_required'; email: string };

export async function resolvePostAuthRoute(
  accessToken: string,
  nextParam: string | null,
  user?: EmailVerificationUser | null,
): Promise<PostAuthRouteResult> {
  if (user && requiresEmailVerificationForProvisioning(user)) {
    return {
      status: 'verification_required',
      email: user.email?.trim() || '',
    };
  }

  await attachGrowthProfile(accessToken);
  const safe = getSafePostLoginRedirect(nextParam);
  const res = await fetch('/api/profile/onboarding-status', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json()) as {
    needsEmailVerification?: boolean;
    needsUsername?: boolean;
    signupUsernameConflict?: boolean;
  };
  if (j.needsEmailVerification) {
    return { status: 'verification_required', email: user?.email?.trim() || '' };
  }
  if (j.needsUsername) {
    const conflict = j.signupUsernameConflict ? '&conflict=signup_username' : '';
    return {
      status: 'redirect',
      destination: `/onboarding/username?next=${encodeURIComponent(safe)}${conflict}`,
    };
  }
  return { status: 'redirect', destination: safe };
}
