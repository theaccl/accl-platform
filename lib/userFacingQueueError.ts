import {
  DAILY_QUEUE_BUSY_HINT,
  LIVE_QUEUE_BUSY_HINT,
} from '@/lib/gameContinuityPresentation';
import { FREE_PLAY_QUEUE_BUSY_MESSAGE } from '@/lib/freePlayFindMatch';
import { LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE } from '@/lib/liveChallengeAcceptGuard';

/** Appended when a live queue action is blocked by an existing live seat. */
export const USER_FACING_LIVE_RESUME_HINT = LIVE_QUEUE_BUSY_HINT;

/** @deprecated Use USER_FACING_LIVE_RESUME_HINT for live queue paths. */
export const USER_FACING_RESUME_HINT = USER_FACING_LIVE_RESUME_HINT;

export { DAILY_QUEUE_BUSY_HINT };

const STABLE_MESSAGES = new Set<string>([
  FREE_PLAY_QUEUE_BUSY_MESSAGE,
  LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE,
  'Could not verify your active games.',
  'Match request not found',
  'This request is no longer pending.',
  'Open listings use the join flow, not direct accept.',
  'Not an open listing.',
  'You cannot join your own listing.',
  'Forbidden',
  'Unauthorized',
  'requestId is required',
  'Invalid JSON body',
  'This request is no longer pending — it may have been accepted, cancelled, or declined already.',
  'Game was not created (empty response).',
  'Accept succeeded but no game id was returned. Refresh match requests.',
  'Join succeeded but no game id was returned. Refresh match requests.',
]);

function looksLikeInternalError(m: string): boolean {
  return (
    /PGRST|SQLSTATE|relation |column |duplicate key value|violates .* constraint/i.test(m) ||
    /^[A-Z][A-Z0-9_]{2,}:/.test(m)
  );
}

/**
 * Normalize queue / match-request / RPC failures into stable, user-safe copy.
 * Raw Postgres, JWT, and infra errors stay server-side only.
 */
export function formatUserFacingQueueError(raw: string | null | undefined): string {
  const m = String(raw ?? '').trim();
  if (!m) return 'Something went wrong. Try again.';
  if (STABLE_MESSAGES.has(m)) return m;

  if (/free_play_player_already_seated/i.test(m)) {
    return 'One player in this match is already in another active or waiting free-play game. Wait until they finish or leave that game, then try again.';
  }
  if (/free_play_joiner_busy/i.test(m)) {
    return FREE_PLAY_QUEUE_BUSY_MESSAGE + USER_FACING_LIVE_RESUME_HINT;
  }
  if (/free_play_host_busy/i.test(m)) {
    return 'That host is already in another game. Pick a different open seat or try Find match.';
  }
  if (/seat already taken|join failed \(race\)/i.test(m)) {
    return 'That seat was just taken. Refresh the list and try another game.';
  }
  if (/open seat not found|seat not active|not a free-play open seat/i.test(m)) {
    return 'That open game is no longer available.';
  }
  if (/JWT expired|invalid JWT|refresh_token/i.test(m)) {
    return 'Sign in again, then retry.';
  }
  if (/duplicate key|unique constraint/i.test(m)) {
    return 'That action was already taken. Refresh and try again.';
  }
  if (/permission denied|row-level security|not authorized/i.test(m)) {
    return 'This action is not allowed right now.';
  }
  if (/connection|timeout|ECONNREFUSED|fetch failed/i.test(m)) {
    return 'Connection problem. Try again in a moment.';
  }
  if (looksLikeInternalError(m)) {
    return 'Something went wrong. Try again.';
  }
  if (m.length <= 220 && !/[{}]/.test(m)) {
    return m;
  }
  return 'Something went wrong. Try again.';
}

/** Alias used by seated-game guard RPC error paths. */
export function formatCreateSeatedGameGuardError(raw: string | null | undefined): string {
  return formatUserFacingQueueError(raw);
}

export function formatMatchRequestApiError(raw: string | null | undefined): string {
  return formatUserFacingQueueError(raw);
}
