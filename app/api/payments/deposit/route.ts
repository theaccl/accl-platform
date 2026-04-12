import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { guardRequest } from '@/lib/server/requestGuard';
import {
  EligibilityEnforcementError,
  enforceDepositAccess,
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
  const guard = guardRequest(request, 'payments');
  if (!guard.ok) return guard.response;

  try {
    const userId = await resolveAuthenticatedUserId(request);
    if (!userId) return json({ error: 'Unauthorized' }, 401);
    try {
      const supabase = createServiceRoleClient();
      const decision = await resolveEligibilityDecisionForUser(supabase, userId);
      enforceDepositAccess(decision);
      return json({ ok: true, user_id: userId, eligibility: decision });
    } catch (e) {
      if (e instanceof EligibilityEnforcementError) {
        return json({ error: e.message, code: e.code, eligibility: e.decision }, 403);
      }
      const message = e instanceof Error ? e.message : 'Deposit check failed';
      return json({ error: message }, 503);
    }
  } finally {
    guard.release();
  }
}
