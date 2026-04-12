import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import {
  EligibilityEnforcementError,
  enforcePayoutAccess,
  resolveEligibilityDecisionForUser,
} from '@/lib/tournamentEligibilityEnforcement';

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
  try {
    const supabase = createServiceRoleClient();
    const decision = await resolveEligibilityDecisionForUser(supabase, userId);
    enforcePayoutAccess(decision);
    return json({ ok: true, user_id: userId, eligibility: decision });
  } catch (e) {
    if (e instanceof EligibilityEnforcementError) {
      return json({ error: e.message, code: e.code, eligibility: e.decision }, 403);
    }
    const message = e instanceof Error ? e.message : 'Payout check failed';
    return json({ error: message }, 503);
  }
}
