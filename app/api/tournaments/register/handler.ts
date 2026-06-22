import { resolveUserNexusEcosystemFromAuthMetadata } from '@/lib/auth/resolveUserNexusEcosystem';
import {
  resolveTournamentJoinActorCookieOrBearer,
  type TournamentJoinActor,
} from '@/lib/auth/resolveTournamentJoinActor';
import { provisioningBlockedReason } from '@/lib/emailVerificationGate';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { executeFreePendingTournamentJoin } from '@/lib/server/tournamentFreeJoin';
import { tournamentApiErrorPayload } from '@/lib/server/tournamentUserFacingError';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

type RegisterBody = {
  tournament_id?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export type TournamentRegisterRouteDeps = {
  resolveTournamentJoinActorCookieOrBearer: typeof resolveTournamentJoinActorCookieOrBearer;
  createServiceRoleClient: typeof createServiceRoleClient;
  executeFreePendingTournamentJoin: typeof executeFreePendingTournamentJoin;
  resolveUserNexusEcosystemFromAuthMetadata: typeof resolveUserNexusEcosystemFromAuthMetadata;
};

const defaultDeps: TournamentRegisterRouteDeps = {
  resolveTournamentJoinActorCookieOrBearer,
  createServiceRoleClient,
  executeFreePendingTournamentJoin,
  resolveUserNexusEcosystemFromAuthMetadata,
};

export async function tournamentRegisterPost(
  request: Request,
  deps: TournamentRegisterRouteDeps = defaultDeps,
): Promise<Response> {
  const actor = await deps.resolveTournamentJoinActorCookieOrBearer(request);
  if (!actor) {
    auditApiLog('tournament_register', { result: 'unauthorized' });
    return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
  }

  if (provisioningBlockedReason(actor)) {
    auditApiLog('tournament_register', {
      result: 'email_verification_required',
      user: shortId(actor.id),
    });
    return json(tournamentApiErrorPayload('email_verification_required'), 403);
  }

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, 400);
  }

  const tournamentId = String(body.tournament_id ?? '').trim();
  if (!tournamentId) {
    auditApiLog('tournament_register', { result: 'bad_request', user: shortId(actor.id) });
    return json({ error: 'tournament_id is required', code: 'TOURNAMENT_ID_REQUIRED' }, 400);
  }

  let supabase;
  try {
    supabase = deps.createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error';
    auditApiLog('tournament_register', { result: 'config_error', user: shortId(actor.id) });
    return json({ error: msg, code: 'SERVER_MISCONFIGURED' }, 503);
  }

  const userEcosystem = deps.resolveUserNexusEcosystemFromAuthMetadata(actor);
  const exec = await deps.executeFreePendingTournamentJoin({
    supabase,
    userId: actor.id,
    tournamentId,
    userEcosystem,
  });

  if (!exec.ok) {
    auditApiLog('tournament_register', {
      result: 'denied',
      code: String(exec.payload.code ?? ''),
      user: shortId(actor.id),
      tournament_id: shortId(tournamentId),
    });
    return json(exec.payload, exec.status);
  }

  auditApiLog('tournament_register', {
    result: exec.alreadyJoined ? 'already_joined' : 'joined',
    user: shortId(actor.id),
    tournament_id: shortId(tournamentId),
  });

  return json({
    ok: true,
    tournament_id: tournamentId,
    user_id: actor.id,
    alreadyJoined: exec.alreadyJoined,
    eligibility: exec.eligibility,
    deprecated: true,
    use_join_endpoint: '/api/tournaments/join',
  });
}

export type { TournamentJoinActor };
