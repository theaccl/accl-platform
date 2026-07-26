import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { isModeratorUser } from '@/lib/moderatorAuth';
import { resolveUserNexusEcosystemFromAuthMetadata } from '@/lib/auth/resolveUserNexusEcosystem';
import {
  buildTournamentSnapshot,
  isTournamentSnapshotId,
  type TournamentSnapshotResult,
} from '@/lib/server/tournamentSnapshotReadModel';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';
import { tournamentApiErrorPayload, tournamentUserFacingMessage } from '@/lib/server/tournamentUserFacingError';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}

function serializeAllowed(s: Extract<TournamentSnapshotResult, { access: 'allowed' }>) {
  return {
    viewer: s.viewer,
    operator: s.operator,
    tournamentEcosystem: s.tournamentEcosystem,
    tournament: s.tournament,
    entries: s.entries,
    matches: s.matches,
    gameStatusById: s.gameStatusById,
    gameOpsById: s.gameOpsById,
    displayNamesByUserId: s.displayNamesByUserId,
  };
}

/**
 * Trusted tournament detail snapshot (service-backed). Does not widen client RLS.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = guardRequest(request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
    const params = await context.params;
const id = String(params?.id ?? '').trim();
    if (!isTournamentSnapshotId(id)) {
      auditApiLog('tournament_snapshot', { result: 'bad_request', reason: 'invalid_id' });
      return json({ ok: false, ...tournamentApiErrorPayload('INVALID_TOURNAMENT_ID') }, 400);
    }

    const sessionUser = await getSupabaseUserFromCookies();
    const isModerator = sessionUser?.id
      ? isModeratorUser({
          userId: sessionUser.id,
          appMetadata: sessionUser.app_metadata ?? {},
          allowedModeratorUserIdsEnv: process.env.ACCL_MODERATOR_USER_IDS,
          enableAllowlistFallback: process.env.ACCL_ENABLE_MODERATOR_ID_FALLBACK === 'true',
        })
      : false;
    const viewer = sessionUser?.id
      ? {
          authenticated: true as const,
          userId: sessionUser.id,
          viewerEcosystem: resolveUserNexusEcosystemFromAuthMetadata(sessionUser),
          isModerator,
        }
      : { authenticated: false as const, userId: null as null, viewerEcosystem: null as null };

    const snap = await buildTournamentSnapshot({ tournamentId: id, viewer });

    if (snap.access === 'denied') {
      auditApiLog('tournament_snapshot', {
        result: 'denied',
        code: snap.code ?? snap.reason,
        tournament_id: shortId(id),
        user: shortId(viewer.userId ?? ''),
      });
      const code = snap.code ?? snap.reason;
      return json(
        {
          ok: false,
          code,
          error: tournamentUserFacingMessage(code, snap.message),
        },
        snap.httpStatus,
      );
    }

    auditApiLog('tournament_snapshot', {
      result: 'ok',
      tournament_id: shortId(id),
      user: shortId(viewer.userId ?? ''),
      insider: snap.viewer.isInsider,
    });

    return json({ ok: true, ...serializeAllowed(snap) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Snapshot failed';
    auditApiLog('tournament_snapshot', { result: 'error', detail: message });
    return json({ ok: false, ...tournamentApiErrorPayload('UNEXPECTED_ERROR', message) }, 503);
  } finally {
    guard.release();
  }
}
