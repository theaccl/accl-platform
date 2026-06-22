import type { SupabaseClient } from '@supabase/supabase-js';

import {
  emailVerificationRequiredPayload,
  provisioningBlockedReason,
} from '@/lib/emailVerificationGate';
import { invalidateLiveQueueAvailabilityForUsers } from '@/lib/server/invalidateLiveQueueAvailability';
import { jsonResponse } from '@/lib/server/httpJson';
import { bearerToken } from '@/lib/server/matchRequestRouteAuth';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { rowIndicatesLiveFreePlayPacing } from '@/lib/freePlayLiveSession';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { formatMatchRequestApiError } from '@/lib/userFacingQueueError';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseOptionalUuid(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function sanitizeSeatedGamePayload(
  userId: string,
  existingOpenSeatId: string | null,
  row: Record<string, unknown>,
): Record<string, unknown> | { error: string; status: number } {
  if (existingOpenSeatId) {
    const payloadBlack = row.black_player_id;
    if (
      payloadBlack != null &&
      typeof payloadBlack === 'string' &&
      payloadBlack.trim() &&
      payloadBlack.trim() !== userId
    ) {
      return { error: 'Forbidden', status: 403 };
    }
    return { black_player_id: userId };
  }

  const white = typeof row.white_player_id === 'string' ? row.white_player_id.trim() : '';
  const black = typeof row.black_player_id === 'string' ? row.black_player_id.trim() : '';
  if (!white || !black) {
    return { error: 'Both seats must be specified for a new seated game.', status: 400 };
  }
  if (userId !== white && userId !== black) {
    return { error: 'Forbidden', status: 403 };
  }
  return row;
}

export type FreePlayCreateSeatedGameRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  bearerToken: typeof bearerToken;
  createServiceRoleClient: typeof createServiceRoleClient;
  invalidateLiveQueueAvailabilityForUsers: typeof invalidateLiveQueueAvailabilityForUsers;
};

const defaultDeps: FreePlayCreateSeatedGameRouteDeps = {
  resolveAuthenticatedUser,
  bearerToken,
  createServiceRoleClient,
  invalidateLiveQueueAvailabilityForUsers,
};

export async function freePlayCreateSeatedGamePost(
  request: Request,
  deps: FreePlayCreateSeatedGameRouteDeps = defaultDeps,
): Promise<Response> {
  const user = await deps.resolveAuthenticatedUser(request);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (provisioningBlockedReason(user)) {
    return jsonResponse(emailVerificationRequiredPayload(), 403);
  }

  const userId = user.id;
  if (!deps.bearerToken(request)) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const existingOpenSeatId = parseOptionalUuid(body.existingOpenSeatId);
  const rowRaw = body.row;
  if (!rowRaw || typeof rowRaw !== 'object' || Array.isArray(rowRaw)) {
    return jsonResponse({ error: 'row must be an object' }, 400);
  }

  const sanitized = sanitizeSeatedGamePayload(userId, existingOpenSeatId, rowRaw as Record<string, unknown>);
  if ('status' in sanitized && typeof sanitized.status === 'number' && 'error' in sanitized) {
    return jsonResponse({ error: sanitized.error }, sanitized.status);
  }

  let serviceSupabase: SupabaseClient;
  try {
    serviceSupabase = deps.createServiceRoleClient();
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Server misconfigured' }, 500);
  }

  const res = await serviceSupabase.rpc('create_seated_game_server_guard', {
    p_actor_id: userId,
    existing_open_seat_id: existingOpenSeatId,
    payload: sanitized,
  });

  if (res.error) {
    console.warn('[free-play.create-seated-game] RPC failed', res.error.message);
    return jsonResponse({ error: formatMatchRequestApiError(res.error.message) }, 400);
  }

  const raw = res.data as unknown;
  const gameRow = Array.isArray(raw) ? raw[0] : raw;
  if (
    gameRow &&
    typeof gameRow === 'object' &&
    'white_player_id' in gameRow &&
    'black_player_id' in (gameRow as object)
  ) {
    const g = gameRow as {
      id?: string;
      white_player_id?: string;
      black_player_id?: string | null;
      tempo?: string | null;
      live_time_control?: string | null;
    };
    if (g.black_player_id && g.white_player_id && g.id && rowIndicatesLiveFreePlayPacing(g)) {
      try {
        await deps.invalidateLiveQueueAvailabilityForUsers({
          userIds: [g.white_player_id, g.black_player_id],
          excludeGameId: g.id,
        });
      } catch (e) {
        console.warn('[free-play.create-seated-game] live queue invalidation failed', e);
      }
    }
  }

  return jsonResponse({ ok: true, game: gameRow ?? null });
}
