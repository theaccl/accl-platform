import type { SupabaseClient } from '@supabase/supabase-js';

import {
  emailVerificationRequiredPayload,
  provisioningBlockedReason,
} from '@/lib/emailVerificationGate';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';
import { jsonResponse } from '@/lib/server/httpJson';
import { bearerToken, userScopedSupabase } from '@/lib/server/matchRequestRouteAuth';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { formatMatchRequestApiError } from '@/lib/userFacingQueueError';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

type SourceGameRow = {
  id: string;
  status: string;
  white_player_id: string;
  black_player_id: string | null;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
};

export type MatchRequestCreateRematchRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  bearerToken: typeof bearerToken;
  createUserSupabase: typeof userScopedSupabase;
  createServiceRoleClient: typeof createServiceRoleClient;
};

const defaultDeps: MatchRequestCreateRematchRouteDeps = {
  resolveAuthenticatedUser,
  bearerToken,
  createUserSupabase: userScopedSupabase,
  createServiceRoleClient,
};

export async function matchRequestCreateRematchPost(
  request: Request,
  deps: MatchRequestCreateRematchRouteDeps = defaultDeps,
): Promise<Response> {
  const user = await deps.resolveAuthenticatedUser(request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (provisioningBlockedReason(user)) {
    return jsonResponse(emailVerificationRequiredPayload(), 403);
  }

  const userId = user.id;
  const token = deps.bearerToken(request);
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const sourceGameId = parseUuid(body.sourceGameId);
  if (!sourceGameId) return jsonResponse({ error: 'sourceGameId must be a valid game id' }, 400);

  let userSupabase: SupabaseClient;
  try {
    userSupabase = deps.createUserSupabase(token);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Server misconfigured' }, 500);
  }

  const { data: gameRow, error: gameErr } = await userSupabase
    .from('games')
    .select('id, status, white_player_id, black_player_id, tempo, live_time_control, rated')
    .eq('id', sourceGameId)
    .maybeSingle();

  if (gameErr) {
    console.warn('[match-requests.create-rematch] game fetch failed', gameErr.message);
    return jsonResponse({ error: formatMatchRequestApiError(gameErr.message) }, 503);
  }
  if (!gameRow) return jsonResponse({ error: 'Game not found' }, 404);

  const game = gameRow as SourceGameRow;
  if (String(game.status ?? '') !== 'finished') {
    return jsonResponse({ error: 'Rematch is only available after the game finishes.' }, 409);
  }
  if (!game.black_player_id) {
    return jsonResponse({ error: 'Rematch requires both players.' }, 409);
  }
  if (userId !== game.white_player_id && userId !== game.black_player_id) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const toUserId =
    userId === game.white_player_id ? game.black_player_id : game.white_player_id;

  const rematchTempo = normalizeGameTempo(game.tempo);
  const rawRematchLtc = game.live_time_control ?? null;
  const rematchLtc =
    canonicalLiveTimeControlForInsert(rematchTempo, rawRematchLtc) ?? rawRematchLtc;

  let serviceSupabase: SupabaseClient;
  try {
    serviceSupabase = deps.createServiceRoleClient();
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Server misconfigured' }, 500);
  }

  const { data: inserted, error: insErr } = await serviceSupabase
    .from('match_requests')
    .insert({
      from_user_id: userId,
      to_user_id: toUserId,
      request_type: 'rematch',
      source_game_id: game.id,
      white_player_id: game.white_player_id,
      black_player_id: game.black_player_id,
      status: 'pending',
      visibility: 'direct',
      tempo: rematchTempo,
      live_time_control: rematchLtc,
      rated: game.rated === true,
    })
    .select('id')
    .single();

  if (insErr) {
    console.warn('[match-requests.create-rematch] insert failed', insErr.message);
    return jsonResponse({ error: formatMatchRequestApiError(insErr.message) }, 400);
  }

  const requestId =
    inserted && typeof inserted === 'object' && 'id' in inserted
      ? String((inserted as { id?: string }).id ?? '').trim()
      : '';
  if (!requestId) {
    return jsonResponse({ error: 'Could not confirm rematch request was saved.' }, 500);
  }

  return jsonResponse({ ok: true, requestId });
}
