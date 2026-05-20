import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { isModeratorUser } from '@/lib/moderatorAuth';
import {
  canUserOperateTournament,
  isTournamentBracketFull,
  orderedUserIdsFromTournamentEntries,
} from '@/lib/server/tournamentOperator';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';
import { tournamentApiErrorPayload } from '@/lib/server/tournamentUserFacingError';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { persistTournamentBracket, TournamentBracketPersistError } from '@/lib/tournamentPersist';

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
 */
export async function POST(request: Request, context: { params: { id: string } }): Promise<Response> {
  const guard = guardRequest(request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
    const tournamentId = String(context.params?.id ?? '').trim();
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
      .select('id, status, created_by')
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

    if (String(tRow.status ?? '').toLowerCase() !== 'pending') {
      return json({ ok: false, error: 'Tournament must be pending to start the bracket.' }, 409);
    }

    const { data: entries, error: eErr } = await supabase
      .from('tournament_entries')
      .select('user_id, seed')
      .eq('tournament_id', tournamentId);
    if (eErr) return json({ ok: false, error: eErr.message }, 502);

    const entryRows = (entries ?? []) as { user_id: string; seed: number | null }[];
    const entrantCount = entryRows.length;
    if (!isTournamentBracketFull(entrantCount)) {
      return json(
        {
          ok: false,
          error: 'Not enough entrants to start — bracket must be full (power-of-2 field, min 2).',
          entrant_count: entrantCount,
        },
        409,
      );
    }

    const { count: matchCount, error: mErr } = await supabase
      .from('tournament_matches')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);
    if (mErr) return json({ ok: false, error: mErr.message }, 502);
    if ((matchCount ?? 0) > 0) {
      return json({ ok: false, error: 'Bracket already exists for this tournament.' }, 409);
    }

    const orderedUserIds = orderedUserIdsFromTournamentEntries(
      entryRows.map((r) => ({ userId: r.user_id, seed: r.seed })),
    );

    try {
      const result = await persistTournamentBracket(supabase, tournamentId, orderedUserIds);
      const gameIds = result.matchRows.map((m) => m.game_id).filter((x): x is string => Boolean(x));

      auditApiLog('tournament_bootstrap', {
        result: 'ok',
        tournament_id: shortId(tournamentId),
        operator: shortId(sessionUser.id),
        moderator: isModerator,
        idempotent: Boolean(result.idempotentReplay),
      });

      return json({
        ok: true,
        tournament_id: tournamentId,
        idempotent_replay: result.idempotentReplay ?? false,
        match_count: result.matchRows.length,
        game_ids: gameIds,
      });
    } catch (e) {
      if (e instanceof TournamentBracketPersistError) {
        auditApiLog('tournament_bootstrap', { result: 'reject', detail: e.message });
        return json({ ok: false, error: e.message }, 409);
      }
      const message = e instanceof Error ? e.message : 'Bootstrap failed';
      auditApiLog('tournament_bootstrap', { result: 'error', detail: message });
      return json({ ok: false, error: message }, 502);
    }
  } finally {
    guard.release();
  }
}
