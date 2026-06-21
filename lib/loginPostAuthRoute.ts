import { getSafePostLoginRedirect } from '@/lib/nexus/nexusRouteHelpers';
import { getStoredEntrySource, getStoredReferral } from '@/lib/public/referralTracking';

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

export async function resolvePostAuthRoute(accessToken: string, nextParam: string | null): Promise<string> {
  await attachGrowthProfile(accessToken);
  const safe = getSafePostLoginRedirect(nextParam);
  const res = await fetch('/api/profile/onboarding-status', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json()) as { needsUsername?: boolean };
  if (j.needsUsername) {
    return `/onboarding/username?next=${encodeURIComponent(safe)}`;
  }
  return safe;
}
