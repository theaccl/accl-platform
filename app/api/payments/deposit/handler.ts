import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { resolveAuthenticatedUser, type AuthenticatedUser } from '@/lib/requestAuth';
import {
  EligibilityEnforcementError,
  enforceDepositAccess,
  resolveEligibilityDecisionForUser,
} from '@/lib/tournamentEligibilityEnforcement';
import { emailVerificationRequiredPayload, provisioningBlockedReason } from '@/lib/emailVerificationGate';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export type DepositRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  createServiceRoleClient: typeof createServiceRoleClient;
  resolveEligibilityDecisionForUser: typeof resolveEligibilityDecisionForUser;
  enforceDepositAccess: typeof enforceDepositAccess;
};

const defaultDeps: DepositRouteDeps = {
  resolveAuthenticatedUser,
  createServiceRoleClient,
  resolveEligibilityDecisionForUser,
  enforceDepositAccess,
};

export async function depositPost(
  request: Request,
  deps: DepositRouteDeps = defaultDeps,
): Promise<Response> {
  const user = await deps.resolveAuthenticatedUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  if (provisioningBlockedReason(user)) {
    return json(emailVerificationRequiredPayload(), 403);
  }

  try {
    const supabase = deps.createServiceRoleClient();
    const decision = await deps.resolveEligibilityDecisionForUser(supabase, user.id);
    deps.enforceDepositAccess(decision);
    return json({ ok: true, user_id: user.id, eligibility: decision });
  } catch (e) {
    if (e instanceof EligibilityEnforcementError) {
      return json({ error: e.message, code: e.code, eligibility: e.decision }, 403);
    }
    const message = e instanceof Error ? e.message : 'Deposit check failed';
    return json({ error: message }, 503);
  }
}

export type { AuthenticatedUser };
