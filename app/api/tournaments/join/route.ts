import { resolveUserNexusEcosystemFromAuthMetadata } from '@/lib/auth/resolveUserNexusEcosystem';
import { resolveTournamentJoinActorCookieOnly } from '@/lib/auth/resolveTournamentJoinActor';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';
import { executeFreePendingTournamentJoin } from '@/lib/server/tournamentFreeJoin';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

type JoinBody = {
  tournamentId?: unknown;
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
    const actor = await resolveTournamentJoinActorCookieOnly();
    if (!actor) {
      auditApiLog('tournament_join', { result: 'unauthorized' });
      return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
    }

    let body: JoinBody;
    try {
      body = (await request.json()) as JoinBody;
    } catch {
      return json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, 400);
    }

    const tournamentId = String(body.tournamentId ?? '').trim();
    if (!tournamentId) {
      auditApiLog('tournament_join', { result: 'bad_request', user: shortId(actor.id) });
      return json({ error: 'tournamentId is required', code: 'TOURNAMENT_ID_REQUIRED' }, 400);
    }

    let supabase;
    try {
      supabase = createServiceRoleClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Service configuration error';
      auditApiLog('tournament_join', { result: 'config_error', user: shortId(actor.id) });
      return json({ error: msg, code: 'SERVER_MISCONFIGURED' }, 503);
    }

    const userEcosystem = resolveUserNexusEcosystemFromAuthMetadata(actor);
    const result = await executeFreePendingTournamentJoin({
      supabase,
      userId: actor.id,
      tournamentId,
      userEcosystem,
    });

    if (!result.ok) {
      auditApiLog('tournament_join', {
        result: 'denied',
        code: String(result.payload.code ?? ''),
        user: shortId(actor.id),
        tournament_id: shortId(tournamentId),
      });
      return json(result.payload, result.status);
    }

    auditApiLog('tournament_join', {
      result: result.alreadyJoined ? 'already_joined' : 'joined',
      user: shortId(actor.id),
      tournament_id: shortId(tournamentId),
    });

    return json({
      ok: true,
      tournamentId,
      alreadyJoined: result.alreadyJoined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Join failed';
    auditApiLog('tournament_join', { result: 'error', detail: message });
    return json({ error: message, code: 'UNEXPECTED_ERROR' }, 503);
  } finally {
    guard.release();
  }
}
