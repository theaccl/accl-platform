import type { SupabaseClient } from '@supabase/supabase-js';

import {
  emailVerificationRequiredPayload,
  provisioningBlockedReason,
} from '@/lib/emailVerificationGate';
import {
  checkUserFreePlayQueueEligible,
  FREE_PLAY_QUEUE_BUSY_MESSAGE,
} from '@/lib/freePlayFindMatch';
import {
  coercePlatTimeForMode,
  isValidPlatTimeForMode,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';
import { openSeatNewGameInsert } from '@/lib/gameStartupInsert';
import type { GameTempo } from '@/lib/gameTempo';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import { freePlayTargetSlot } from '@/lib/freePlayQueueSlotConflict';
import { userHasConflictingPlatQueueSlot } from '@/lib/hasActiveWaitingLiveFreeGame';
import { jsonResponse } from '@/lib/server/httpJson';
import { bearerToken, userScopedSupabase } from '@/lib/server/matchRequestRouteAuth';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { formatMatchRequestApiError } from '@/lib/userFacingQueueError';

function parsePlatMode(value: unknown): PlatMode | null {
  if (value === 'bullet' || value === 'blitz' || value === 'rapid' || value === 'daily') {
    return value;
  }
  return null;
}

function buildOpenSeatRow(
  userId: string,
  mode: PlatMode,
  clock: string,
  rated: boolean,
): Record<string, unknown> {
  const base = openSeatNewGameInsert(userId, { rated });
  const tc = coercePlatTimeForMode(mode, clock);
  if (mode === 'daily') {
    const ltc = canonicalLiveTimeControlForInsert('daily', tc) ?? tc;
    return { ...base, tempo: 'daily' as GameTempo, live_time_control: ltc };
  }
  const ltc = canonicalLiveTimeControlForInsert('live', tc) ?? tc;
  return { ...base, tempo: 'live' as GameTempo, live_time_control: ltc };
}

export type FreePlayCreateOpenSeatRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  bearerToken: typeof bearerToken;
  createUserSupabase: typeof userScopedSupabase;
  createServiceRoleClient: typeof createServiceRoleClient;
};

const defaultDeps: FreePlayCreateOpenSeatRouteDeps = {
  resolveAuthenticatedUser,
  bearerToken,
  createUserSupabase: userScopedSupabase,
  createServiceRoleClient,
};

export async function freePlayCreateOpenSeatPost(
  request: Request,
  deps: FreePlayCreateOpenSeatRouteDeps = defaultDeps,
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

  const mode = parsePlatMode(body.mode);
  if (!mode) return jsonResponse({ error: 'mode must be bullet, blitz, rapid, or daily' }, 400);

  const clock = typeof body.clock === 'string' ? body.clock.trim() : '';
  if (!clock) return jsonResponse({ error: 'clock is required' }, 400);

  const rated = body.rated === true;
  const normalizedClock = coercePlatTimeForMode(mode, clock);
  if (!isValidPlatTimeForMode(mode, normalizedClock)) {
    return jsonResponse({ error: 'Invalid time control for the selected mode.' }, 400);
  }

  let supabase: SupabaseClient;
  try {
    supabase = deps.createUserSupabase(token);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Server misconfigured' }, 500);
  }

  const gate = await checkUserFreePlayQueueEligible(supabase, userId, {
    mode,
    clock: normalizedClock,
    rated,
  });
  if (!('ok' in gate)) {
    return jsonResponse(
      {
        error: gate.error,
        resumeGameId: gate.resumeGameId,
      },
      409,
    );
  }

  const row = buildOpenSeatRow(userId, mode, normalizedClock, rated);

  let serviceSupabase: SupabaseClient;
  try {
    serviceSupabase = deps.createServiceRoleClient();
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Server misconfigured' }, 500);
  }

  const { data: created, error: insErr } = await serviceSupabase.from('games').insert(row).select('id').single();
  if (insErr) {
    const slot = freePlayTargetSlot(mode, normalizedClock, rated);
    const resume = await userHasConflictingPlatQueueSlot(supabase, userId, slot);
    if (typeof resume === 'string' && resume.trim()) {
      return jsonResponse(
        { error: FREE_PLAY_QUEUE_BUSY_MESSAGE, resumeGameId: resume },
        409,
      );
    }
    console.warn('[free-play.create-open-seat] insert failed', insErr.message);
    return jsonResponse({ error: formatMatchRequestApiError(insErr.message) }, 400);
  }

  const gameId = created?.id as string | undefined;
  if (!gameId) return jsonResponse({ error: 'Could not post to the queue.' }, 500);

  return jsonResponse({
    ok: true,
    gameId,
    hostLiveOpenSeat: mode !== 'daily',
  });
}
