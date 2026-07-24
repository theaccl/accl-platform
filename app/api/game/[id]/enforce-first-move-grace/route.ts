import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  FIRST_MOVE_ABANDON_END_REASON,
  firstMoveGraceAbsenteeSide,
  firstMoveGraceExpired,
  firstMoveGraceFinishResult,
  firstMoveGraceRemainingMs,
  isLiveTournamentBoard,
  bothSeatedForFirstMoveGrace,
} from '@/lib/tournamentFirstMoveGrace';
import { guardRequest } from '@/lib/server/requestGuard';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

/**
 * Narrow live-tournament guard: finish 0-move boards after first-move grace (authoritative path).
 */
export async function POST(
  _request: Request,
    context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = guardRequest(_request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
        const params = await context.params;
    const gameId = String(params?.id ?? '').trim();
    if (!gameId) return json({ ok: false, error: 'invalid_game_id' }, 400);

    const sessionUser = await getSupabaseUserFromCookies();
    if (!sessionUser?.id) return json({ ok: false, error: 'sign_in_required' }, 401);

    const admin = createServiceRoleClient();
    const { data: game, error: gErr } = await admin
      .from('games')
      .select(
        'id,status,play_context,tournament_id,tempo,white_player_id,black_player_id,turn,created_at,result',
      )
      .eq('id', gameId)
      .maybeSingle();

    if (gErr || !game) return json({ ok: false, error: 'game_not_found' }, 404);

    const row = game as {
      id: string;
      status: string;
      play_context: string | null;
      tournament_id: string | null;
      tempo: string | null;
      white_player_id: string;
      black_player_id: string | null;
      turn: string | null;
      created_at: string | null;
      result: string | null;
    };

    const uid = sessionUser.id;
    const seated =
      uid === row.white_player_id || (row.black_player_id != null && uid === row.black_player_id);
    if (!seated) return json({ ok: false, error: 'not_a_participant' }, 403);

    if (row.status === 'finished') {
      return json({ ok: true, already_finished: true, end_reason: FIRST_MOVE_ABANDON_END_REASON });
    }

    if (!isLiveTournamentBoard(row) || !bothSeatedForFirstMoveGrace(row)) {
      return json({ ok: false, error: 'not_applicable' }, 400);
    }

    const { count, error: cErr } = await admin
      .from('game_move_logs')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId);
    if (cErr) return json({ ok: false, error: 'move_log_check_failed' }, 503);
    if ((count ?? 0) > 0) {
      return json({ ok: true, skipped: true, reason: 'moves_exist' });
    }

    if (!firstMoveGraceExpired(row)) {
      return json({
        ok: true,
        waiting: true,
        remaining_ms: firstMoveGraceRemainingMs(row),
      });
    }

    const absentee = firstMoveGraceAbsenteeSide(row);
    const result = firstMoveGraceFinishResult(absentee);

    const { error: finErr } = await admin.rpc('finish_game_system', {
      p_game_id: gameId,
      p_result: result,
      p_end_reason: FIRST_MOVE_ABANDON_END_REASON,
    });

    if (finErr) {
      return json({ ok: false, error: finErr.message }, 503);
    }

    return json({
      ok: true,
      enforced: true,
      result,
      end_reason: FIRST_MOVE_ABANDON_END_REASON,
      absentee,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'enforce_failed';
    return json({ ok: false, error: message }, 503);
  } finally {
    guard.release();
  }
}
