import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { isModeratorUser } from '@/lib/moderatorAuth';
import { LIVE_LAUNCH_COUNTDOWN_SEC, isLiveTournamentForLaunch } from '@/lib/tournamentLaunchAttendance';
import {
  canUserOperateTournament,
  isTournamentBracketFull,
} from '@/lib/server/tournamentOperator';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

/** Live launch countdown — does not spawn bracket (bootstrap still required after timer). */
export async function POST(
  request: Request,
  context: { params: { id: string } },
): Promise<Response> {
  const guard = guardRequest(request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
    const tournamentId = String(context.params?.id ?? '').trim();
    if (!UUID_RE.test(tournamentId)) {
      return json({ ok: false, error: 'Invalid tournament id.' }, 400);
    }

    const sessionUser = await getSupabaseUserFromCookies();
    if (!sessionUser?.id) {
      return json({ ok: false, error: 'Sign in required.' }, 401);
    }

    const isModerator = isModeratorUser({
      userId: sessionUser.id,
      appMetadata: sessionUser.app_metadata ?? {},
      allowedModeratorUserIdsEnv: process.env.ACCL_MODERATOR_USER_IDS,
      enableAllowlistFallback: process.env.ACCL_ENABLE_MODERATOR_ID_FALLBACK === 'true',
    });

    const supabase = createServiceRoleClient();
    const { data: tRow, error: tErr } = await supabase
      .from('tournaments')
      .select('id, status, tempo, created_by')
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) return json({ ok: false, error: tErr.message }, 502);
    if (!tRow) return json({ ok: false, error: 'Tournament not found.' }, 404);

    const createdBy = tRow.created_by != null ? String(tRow.created_by) : null;
    if (
      !canUserOperateTournament({
        userId: sessionUser.id,
        createdById: createdBy,
        isModerator,
      })
    ) {
      return json({ ok: false, error: 'Only the host or a moderator can schedule launch.' }, 403);
    }

    if (String(tRow.status ?? '').toLowerCase() !== 'pending') {
      return json({ ok: false, error: 'Tournament must be pending.' }, 409);
    }

    if (!isLiveTournamentForLaunch(tRow.tempo != null ? String(tRow.tempo) : null)) {
      return json({ ok: false, error: 'Launch countdown applies to live tournaments only.' }, 409);
    }

    const { count: entrantCount, error: cErr } = await supabase
      .from('tournament_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('entry_role', 'entrant');
    if (cErr) return json({ ok: false, error: cErr.message }, 502);
    if (!isTournamentBracketFull(entrantCount ?? 0)) {
      return json({ ok: false, error: 'Bracket is not full yet.' }, 409);
    }

    const { count: matchCount, error: mErr } = await supabase
      .from('tournament_matches')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);
    if (mErr) return json({ ok: false, error: mErr.message }, 502);
    if ((matchCount ?? 0) > 0) {
      return json({ ok: false, error: 'Bracket already exists.' }, 409);
    }

    const launchAt = new Date(Date.now() + LIVE_LAUNCH_COUNTDOWN_SEC * 1000).toISOString();
    const { error: upErr } = await supabase
      .from('tournaments')
      .update({ launch_scheduled_at: launchAt })
      .eq('id', tournamentId)
      .eq('status', 'pending');
    if (upErr) return json({ ok: false, error: upErr.message }, 502);

    auditApiLog('tournament_launch_schedule', {
      tournament_id: shortId(tournamentId),
      operator: shortId(sessionUser.id),
      countdown_sec: LIVE_LAUNCH_COUNTDOWN_SEC,
    });

    return json({
      ok: true,
      launch_scheduled_at: launchAt,
      countdown_sec: LIVE_LAUNCH_COUNTDOWN_SEC,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Launch schedule failed';
    return json({ ok: false, error: message }, 503);
  } finally {
    guard.release();
  }
}
