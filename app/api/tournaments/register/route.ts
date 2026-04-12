import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import {
  EligibilityEnforcementError,
  enforceTournamentRegistration,
  resolveEligibilityDecisionForUser,
} from '@/lib/tournamentEligibilityEnforcement';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';

export const runtime = 'nodejs';

type RegisterBody = {
  tournament_id?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    auditApiLog('tournament_register', { result: 'unauthorized' });
    return json({ error: 'Unauthorized' }, 401);
  }
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const tournamentId = String(body.tournament_id ?? '').trim();
  if (!tournamentId) {
    auditApiLog('tournament_register', { result: 'bad_request', user: shortId(userId) });
    return json({ error: 'tournament_id is required' }, 400);
  }

  try {
    const supabase = createServiceRoleClient();
    const decision = await resolveEligibilityDecisionForUser(supabase, userId);
    enforceTournamentRegistration(decision);

    auditApiLog('tournament_register', {
      result: 'ok',
      tournament_id: shortId(tournamentId),
      user: shortId(userId),
    });
    // Scaffold-only gate: endpoint demonstrates server-side enforcement.
    return json({ ok: true, tournament_id: tournamentId, user_id: userId, eligibility: decision });
  } catch (e) {
    if (e instanceof EligibilityEnforcementError) {
      auditApiLog('tournament_register', {
        result: 'eligibility_denied',
        code: e.code,
        user: shortId(userId),
        tournament_id: shortId(tournamentId),
      });
      return json({ error: e.message, code: e.code, eligibility: e.decision }, 403);
    }
    const message = e instanceof Error ? e.message : 'Registration failed';
    auditApiLog('tournament_register', { result: 'error', user: shortId(userId) });
    return json({ error: message }, 503);
  }
  } finally {
    guard.release();
  }
}
