import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isDirectOrPrivateLivePacedMatchRequest,
  LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE,
} from '@/lib/liveChallengeAcceptGuard';
import {
  freePlayTargetSlotFromGameOrRequestFields,
  userHasConflictingPlatQueueSlot,
} from '@/lib/hasActiveWaitingLiveFreeGame';
import { formatUserFacingQueueError } from '@/lib/userFacingQueueError';

export type MatchRequestActionRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  request_type: string;
  status: string;
  visibility?: string | null;
  tempo?: string | null;
  live_time_control?: string | null;
  rated?: boolean | null;
};

function isDirectVisibility(r: MatchRequestActionRow): boolean {
  return (r.visibility ?? '') !== 'open';
}

export async function acceptMatchRequestViaApi(
  supabase: SupabaseClient,
  authUserId: string,
  row: MatchRequestActionRow,
): Promise<{ ok: true; gameId: string } | { ok: false; error: string }> {
  if (row.to_user_id !== authUserId) {
    return { ok: false, error: 'Forbidden' };
  }
  if (!isDirectVisibility(row)) {
    return { ok: false, error: 'Open listings use the join flow.' };
  }

  if (isDirectOrPrivateLivePacedMatchRequest(row)) {
    const slot = freePlayTargetSlotFromGameOrRequestFields({
      tempo: row.tempo,
      live_time_control: row.live_time_control,
      rated: row.rated === true,
    });
    if (slot) {
      const c = await userHasConflictingPlatQueueSlot(supabase, authUserId, slot);
      if (c && typeof c === 'object' && 'queryError' in c) {
        return { ok: false, error: 'Could not verify your active games.' };
      }
      if (typeof c === 'string' && c) {
        return { ok: false, error: LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE };
      }
    }
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token?.trim();
  if (!token) {
    return { ok: false, error: 'Sign in to accept a match request.' };
  }

  const httpRes = await fetch('/api/match-requests/accept', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId: row.id }),
  });
  const payload = (await httpRes.json().catch(() => ({}))) as { error?: unknown; gameId?: unknown };
  if (!httpRes.ok) {
    const err =
      typeof payload.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : `Accept failed (${httpRes.status})`;
    return { ok: false, error: formatUserFacingQueueError(err) };
  }
  const gameId = typeof payload.gameId === 'string' ? payload.gameId.trim() : '';
  if (!gameId) {
    return { ok: false, error: 'Accept succeeded but no game id was returned.' };
  }
  return { ok: true, gameId };
}

export async function declineIncomingMatchRequest(
  supabase: SupabaseClient,
  authUserId: string,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('match_requests')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .eq('to_user_id', authUserId);
  if (error) {
    return { ok: false, error: formatUserFacingQueueError(error.message) };
  }
  return { ok: true };
}
