import { resolveUserNexusEcosystemFromAuthMetadata } from '@/lib/auth/resolveUserNexusEcosystem';
import {
  resolveTournamentJoinActorCookieOnly,
  type TournamentJoinActor,
} from '@/lib/auth/resolveTournamentJoinActor';
import { provisioningBlockedReason } from '@/lib/emailVerificationGate';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { executeFreePendingTournamentJoin } from '@/lib/server/tournamentFreeJoin';
import {
  tournamentApiErrorPayload,
  withTournamentUserFacingError,
} from '@/lib/server/tournamentUserFacingError';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

type JoinBody = {
  tournamentId?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export type TournamentJoinRouteDeps = {
  resolveTournamentJoinActorCookieOnly: typeof resolveTournamentJoinActorCookieOnly;
  createServiceRoleClient: typeof createServiceRoleClient;
  executeFreePendingTournamentJoin: typeof executeFreePendingTournamentJoin;
  resolveUserNexusEcosystemFromAuthMetadata: typeof resolveUserNexusEcosystemFromAuthMetadata;
};

const defaultDeps: TournamentJoinRouteDeps = {
  resolveTournamentJoinActorCookieOnly,
  createServiceRoleClient,
  executeFreePendingTournamentJoin,
  resolveUserNexusEcosystemFromAuthMetadata,
};

export async function tournamentJoinPost(
  request: Request,
  deps: TournamentJoinRouteDeps = defaultDeps,
): Promise<Response> {
  const actor = await deps.resolveTournamentJoinActorCookieOnly();
  if (!actor) {
    auditApiLog('tournament_join', { result: 'unauthorized' });
    return json(tournamentApiErrorPayload('UNAUTHORIZED'), 401);
  }

  if (provisioningBlockedReason(actor)) {
    auditApiLog('tournament_join', { result: 'email_verification_required', user: shortId(actor.id) });
    return json(tournamentApiErrorPayload('email_verification_required'), 403);
  }

  let body: JoinBody;
  try {
    body = (await request.json()) as JoinBody;
  } catch {
    return json(tournamentApiErrorPayload('INVALID_JSON'), 400);
  }

  const tournamentId = String(body.tournamentId ?? '').trim();
  if (!tournamentId) {
    auditApiLog('tournament_join', { result: 'bad_request', user: shortId(actor.id) });
    return json(tournamentApiErrorPayload('TOURNAMENT_ID_REQUIRED'), 400);
  }

  let supabase;
  try {
    supabase = deps.createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error';
    auditApiLog('tournament_join', { result: 'config_error', user: shortId(actor.id) });
    return json({ error: msg, code: 'SERVER_MISCONFIGURED' }, 503);
  }

  const userEcosystem = deps.resolveUserNexusEcosystemFromAuthMetadata(actor);
  const result = await deps.executeFreePendingTournamentJoin({
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
    return json(withTournamentUserFacingError(result.payload), result.status);
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
}

export type { TournamentJoinActor };
