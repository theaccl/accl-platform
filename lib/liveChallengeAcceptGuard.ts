import { rowIndicatesLiveFreePlayPacing } from '@/lib/freePlayLiveSession';

/** Shown when the addressee already has an active/waiting live free game and tries to accept another live request. */
export const LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE =
  'Cannot accept while currently in a live game.';

/** Direct / private row (not an open worldwide listing). */
export function isNonOpenMatchRequestVisibility(visibility: string | null | undefined): boolean {
  return String(visibility ?? '').trim().toLowerCase() !== 'open';
}

/**
 * Incoming request is **live-paced** (bullet/blitz/rapid style), including mis-stored `tempo` with a live clock in
 * `live_time_control`. Open listings are excluded — they use the join flow.
 */
export function isDirectOrPrivateLivePacedMatchRequest(row: {
  visibility?: string | null;
  tempo?: string | null;
  live_time_control?: string | null;
}): boolean {
  if (!isNonOpenMatchRequestVisibility(row.visibility)) return false;
  return rowIndicatesLiveFreePlayPacing(row);
}

/**
 * Block accepting an incoming **live** match request (caller already ensured live-paced) when the user has a
 * free-play conflict in the **same** PLAT slot (mode+clock+rated) — not global “in any live game.”
 */
export function shouldBlockAcceptIncomingLiveWhileInLiveGame(
  hasConflictingPlatQueueSlot: boolean
): boolean {
  return hasConflictingPlatQueueSlot;
}
