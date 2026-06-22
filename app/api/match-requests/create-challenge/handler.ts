import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type ChallengeColorPreference,
  resolveChallengeSeatIds,
} from '@/lib/challengeColorPreference';
import {
  emailVerificationRequiredPayload,
  provisioningBlockedReason,
} from '@/lib/emailVerificationGate';
import {
  coercePlatTimeForMode,
  platSelectionToStoredGameFields,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
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

function parseColorPreference(value: unknown): ChallengeColorPreference | null {
  if (value === 'white' || value === 'black' || value === 'random') return value;
  return null;
}

function parsePlatMode(value: unknown): PlatMode | null {
  if (value === 'bullet' || value === 'blitz' || value === 'rapid' || value === 'daily') {
    return value;
  }
  return null;
}

function normalizeLiveTimeControlForInsert(tempo: string, liveTimeControl: string): string {
  const t = tempo === 'daily' ? 'daily' : 'live';
  const canonical = canonicalLiveTimeControlForInsert(t, liveTimeControl) ?? liveTimeControl;
  return String(canonical)
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
}

export type MatchRequestCreateChallengeRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  bearerToken: typeof bearerToken;
  createUserSupabase: typeof userScopedSupabase;
  createServiceRoleClient: typeof createServiceRoleClient;
};

const defaultDeps: MatchRequestCreateChallengeRouteDeps = {
  resolveAuthenticatedUser,
  bearerToken,
  createUserSupabase: userScopedSupabase,
  createServiceRoleClient,
};

export async function matchRequestCreateChallengePost(
  request: Request,
  deps: MatchRequestCreateChallengeRouteDeps = defaultDeps,
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

  const toUserId = parseUuid(body.toUserId);
  if (!toUserId) return jsonResponse({ error: 'toUserId must be a valid user id' }, 400);
  if (toUserId === userId) return jsonResponse({ error: 'You cannot challenge yourself.' }, 400);

  const colorPreference = parseColorPreference(body.colorPreference);
  if (!colorPreference) {
    return jsonResponse({ error: 'colorPreference must be white, black, or random' }, 400);
  }

  const platMode = parsePlatMode(body.platMode);
  if (!platMode) return jsonResponse({ error: 'platMode must be bullet, blitz, rapid, or daily' }, 400);

  const platClock = typeof body.platClock === 'string' ? body.platClock.trim() : '';
  if (!platClock) return jsonResponse({ error: 'platClock is required' }, 400);

  const rated = body.rated === true;

  let challengeTempo: string;
  let challengeLtc: string;
  try {
    const stored = platSelectionToStoredGameFields(platMode, platClock);
    challengeTempo = stored.tempo;
    challengeLtc = normalizeLiveTimeControlForInsert(challengeTempo, stored.live_time_control);
  } catch {
    return jsonResponse({ error: 'Invalid mode and time control. Pick a valid combination.' }, 400);
  }

  const { whiteId: challengeWhiteId, blackId: challengeBlackId } = resolveChallengeSeatIds(
    colorPreference,
    userId,
    toUserId,
  );

  let userSupabase: SupabaseClient;
  try {
    userSupabase = deps.createUserSupabase(token);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Server misconfigured' }, 500);
  }

  const { data: pendingDup, error: dupErr } = await userSupabase
    .from('match_requests')
    .select('id')
    .eq('from_user_id', userId)
    .eq('to_user_id', toUserId)
    .eq('tempo', challengeTempo)
    .eq('live_time_control', challengeLtc)
    .eq('status', 'pending')
    .eq('request_type', 'challenge')
    .eq('white_player_id', challengeWhiteId)
    .eq('black_player_id', challengeBlackId)
    .eq('rated', rated)
    .limit(1)
    .maybeSingle();

  if (dupErr) {
    console.warn('[match-requests.create-challenge] duplicate check failed', dupErr.message);
    return jsonResponse({ error: formatMatchRequestApiError(dupErr.message) }, 503);
  }
  if (pendingDup) {
    return jsonResponse(
      {
        error:
          'You already have a pending challenge for this mode, time control, color, and match type (rated/unrated).',
      },
      409,
    );
  }

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
      request_type: 'challenge',
      source_game_id: null,
      white_player_id: challengeWhiteId,
      black_player_id: challengeBlackId,
      status: 'pending',
      visibility: 'direct',
      tempo: challengeTempo,
      live_time_control: challengeLtc,
      rated,
    })
    .select('id')
    .single();

  if (insErr) {
    console.warn('[match-requests.create-challenge] insert failed', insErr.message);
    return jsonResponse({ error: formatMatchRequestApiError(insErr.message) }, 400);
  }

  const requestId =
    inserted && typeof inserted === 'object' && 'id' in inserted
      ? String((inserted as { id?: string }).id ?? '').trim()
      : '';
  if (!requestId) {
    return jsonResponse({ error: 'Could not confirm challenge request was saved.' }, 500);
  }

  return jsonResponse({ ok: true, requestId });
}
