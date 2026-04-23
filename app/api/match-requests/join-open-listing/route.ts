import { createClient } from '@supabase/supabase-js';

import { gameInsertFromAcceptedChallenge } from '@/lib/gameStartupInsert';
import { rowIndicatesLiveFreePlayPacing } from '@/lib/freePlayLiveSession';
import { LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE } from '@/lib/liveChallengeAcceptGuard';
import { invalidateLiveQueueAvailabilityForUsers } from '@/lib/server/invalidateLiveQueueAvailability';
import { userInLiveFreeSeatedGameAdmin } from '@/lib/server/userHasLiveFreeSessionAdmin';
import { getClientIp } from '@/lib/server/clientIp';
import { jsonResponse, tooManyRequests } from '@/lib/server/httpJson';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';

export const runtime = 'nodejs';

type MatchRequestRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  request_type: string;
  status: string;
  visibility?: string | null;
  tempo?: string | null;
  live_time_control?: string | null;
  white_player_id: string;
  black_player_id: string;
  source_game_id?: string | null;
  rated?: boolean | null;
};

function bearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t : null;
}

function userScopedSupabase(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

/**
 * Secured join for **open / public** match listings from `/requests`.
 * After the game row exists and the listing is marked accepted, voids both players' other live queue
 * state (same timing as direct accept) so stale listings cannot be joined afterward.
 * Blocks live joins when the user is already in a **seated** live free game (not their own solo open seats).
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`match-requests:join-open:${ip}`, 30, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const token = bearerToken(request);
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: { requestId?: unknown };
  try {
    body = (await request.json()) as { requestId?: unknown };
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (!requestId) return jsonResponse({ error: 'requestId is required' }, 400);

  let supabase;
  try {
    supabase = userScopedSupabase(token);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Server misconfigured' }, 500);
  }

  const { data: row, error: fetchErr } = await supabase.from('match_requests').select('*').eq('id', requestId).maybeSingle();
  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 503);
  if (!row) return jsonResponse({ error: 'Match request not found' }, 404);

  const r = row as MatchRequestRow;
  if (String(r.status ?? '') !== 'pending') {
    return jsonResponse({ error: 'This request is no longer pending.' }, 409);
  }
  if (String(r.visibility ?? '') !== 'open') {
    return jsonResponse({ error: 'Not an open listing.' }, 400);
  }
  if (String(r.from_user_id ?? '') === userId) {
    return jsonResponse({ error: 'You cannot join your own listing.' }, 400);
  }

  if (rowIndicatesLiveFreePlayPacing(r)) {
    const seatedBusy = await userInLiveFreeSeatedGameAdmin(userId);
    if (seatedBusy) {
      return jsonResponse({ error: LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE }, 409);
    }
  }

  const { data: claimed, error: claimError } = await supabase
    .from('match_requests')
    .update({ to_user_id: userId })
    .eq('id', requestId)
    .eq('status', 'pending')
    .eq('visibility', 'open')
    .or(`to_user_id.is.null,to_user_id.eq.${userId}`)
    .select('*')
    .single();

  if (claimError) {
    return jsonResponse({ error: claimError.message }, 400);
  }

  const claimedRow = claimed as MatchRequestRow;
  const challengeRow = { ...gameInsertFromAcceptedChallenge(claimedRow) };
  const gameCreateRes = await supabase.from('games').insert(challengeRow).select('id').single();
  const newGame = gameCreateRes.data;
  const gErr = gameCreateRes.error;
  if (gErr) {
    return jsonResponse({ error: gErr.message }, 400);
  }
  const rawId =
    newGame && typeof newGame === 'object' && 'id' in newGame
      ? String((newGame as { id?: string }).id ?? '').trim()
      : '';
  if (!rawId) {
    return jsonResponse({ error: 'Game was not created (empty response).' }, 500);
  }

  const { data: updatedRows, error: uErr } = await supabase
    .from('match_requests')
    .update({
      status: 'accepted',
      resolution_game_id: rawId,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');

  if (uErr) {
    return jsonResponse(
      {
        error: uErr.message,
        gameId: rawId,
        detail: 'Game may have been created but the match request could not be marked accepted.',
      },
      500
    );
  }
  const n = Array.isArray(updatedRows) ? updatedRows.length : updatedRows ? 1 : 0;
  if (n === 0) {
    return jsonResponse(
      {
        error: 'This request is no longer pending — it may have been accepted, cancelled, or declined already.',
        gameId: rawId,
      },
      409
    );
  }

  const hostId = String(claimedRow.from_user_id ?? '').trim();
  try {
    await invalidateLiveQueueAvailabilityForUsers({
      userIds: [...new Set([hostId, userId].filter(Boolean))],
      excludeGameId: rawId,
      excludeRequestId: requestId,
    });
  } catch (e) {
    console.warn('[match-requests.join-open-listing] live queue invalidation failed', e);
  }

  return jsonResponse({ ok: true, gameId: rawId });
}
