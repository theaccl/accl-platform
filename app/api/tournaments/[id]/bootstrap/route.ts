import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { isModeratorUser } from '@/lib/moderatorAuth';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';
import { runTournamentBootstrap } from '@/lib/server/tournamentBootstrap';
import { canUserOperateTournament } from '@/lib/server/tournamentOperator';
import { tournamentApiErrorPayload } from '@/lib/server/tournamentUserFacingError';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}

/**
 * Host/moderator bracket bootstrap — same persistence path as internal ops bootstrap.
 * Live tournaments: attendance gate + optional launch countdown before spawn.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = guardRequest(request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
    const params = await context.params;
const tournamentId = String(params?.id ?? '').trim();
    if (!UUID_RE.test(tournamentId)) {
      return json({ ok: false, ...tournamentApiErrorPayload('INVALID_TOURNAMENT_ID') }, 400);
    }

    const sessionUser = await getSupabaseUserFromCookies();
    if (!sessionUser?.id) {
      return json({ ok: false, ...tournamentApiErrorPayload('UNAUTHORIZED') }, 401);
    }

    const isModerator = isModeratorUser({
      userId: sessionUser.id,
      appMetadata: sessionUser.app_metadata ?? {},
      allowedModeratorUserIdsEnv: process.env.ACCL_MODERATOR_USER_IDS,
      enableAllowlistFallback: process.env.ACCL_ENABLE_MODERATOR_ID_FALLBACK === 'true',
    });

    let supabase;
    try {
      supabase = createServiceRoleClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Service configuration error';
      return json({ ok: false, error: msg }, 503);
    }

    const { data: tRow, error: tErr } = await supabase
      .from('tournaments')
      .select('id, created_by')
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) return json({ ok: false, error: tErr.message }, 502);
    if (!tRow) return json({ ok: false, ...tournamentApiErrorPayload('TOURNAMENT_NOT_FOUND') }, 404);

    const createdBy = tRow.created_by != null ? String(tRow.created_by) : null;
    if (
      !canUserOperateTournament({
        userId: sessionUser.id,
        createdById: createdBy,
        isModerator,
      })
    ) {
      return json({ ok: false, error: 'Only the tournament host or a moderator can start the bracket.' }, 403);
    }

    const result = await runTournamentBootstrap(supabase, tournamentId);
    if (!result.ok) {
      auditApiLog('tournament_bootstrap', {
        result: 'reject',
        code: result.code,
        detail: result.error,
      });
      return json(
        {
          ok: false,
          error: result.error,
          code: result.code,
          ...(result.detail ?? {}),
        },
        result.status,
      );
    }

    auditApiLog('tournament_bootstrap', {
      result: 'ok',
      tournament_id: shortId(tournamentId),
      operator: shortId(sessionUser.id),
      moderator: isModerator,
      idempotent: result.idempotent_replay,
      launch_attendance: result.launch_attendance_applied,
    });

    return json(result);
  } finally {
    guard.release();
  }
}
