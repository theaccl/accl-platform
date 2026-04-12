import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { getUserEligibilityMetadata } from '@/lib/userEligibilityStore';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { upsertEligibilityFromOnboarding, validateEligibilityCapture } from '@/lib/onboardingEligibility';
import { resolveEligibilityDecisionForUser } from '@/lib/tournamentEligibilityEnforcement';

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
  try {
    const supabase = createServiceRoleClient();
    const metadata = await getUserEligibilityMetadata(supabase, userId);
    const decision = await resolveEligibilityDecisionForUser(supabase, userId);
    return json({ user_id: userId, decision, metadata });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Eligibility lookup failed';
    return json({ error: message }, 503);
  }
}

type EligibilityBody = {
  country?: unknown;
  region?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  let body: EligibilityBody;
  try {
    body = (await request.json()) as EligibilityBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const validation = validateEligibilityCapture({
    country: typeof body.country === 'string' ? body.country : null,
    region: typeof body.region === 'string' ? body.region : null,
  });
  if (!validation.ok) {
    return json({ error: validation.reason ?? 'Invalid eligibility payload' }, 400);
  }

  try {
    const supabase = createServiceRoleClient();
    const { decision } = await upsertEligibilityFromOnboarding(supabase, {
      userId,
      country: validation.country,
      region: validation.region,
    });
    return json({ user_id: userId, decision });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Eligibility update failed';
    return json({ error: message }, 503);
  }
}
