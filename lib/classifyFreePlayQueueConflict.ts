/**
 * Classify the row the one-seat queue guard blocked on, from the blocked user's
 * perspective. This is presentation-only: it never changes queue authority, never
 * weakens the one-seat guard, and never enables silent seat replacement.
 *
 * - `waiting_seat`: the user's own unmatched live open seat (host alone, no Black).
 * - `seated_live_game`: a two-player live game the user is in (White or Black seated).
 *
 * Returns `null` for anything that must not drive waiting-seat UX (daily /
 * correspondence, finished, or a non-owned open seat).
 */
export type QueueConflictKind = 'waiting_seat' | 'seated_live_game';

export type FreePlayQueueConflictRow = {
  white_player_id: string | null;
  black_player_id: string | null;
  status?: string | null;
  tempo: string | null;
};

/** Enriched conflict surfaced to queue callers so they can branch copy + actions. */
export type QueueConflict = {
  gameId: string;
  kind: QueueConflictKind;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  tempo: string | null;
  liveTimeControl: string | null;
  rated: boolean | null;
};

export function classifyFreePlayQueueConflict(
  row: FreePlayQueueConflictRow,
  userId: string
): QueueConflictKind | null {
  const isLive = row.tempo === 'live';
  const isOpen = row.status === 'active' || row.status === 'waiting';
  if (!isLive || !isOpen) {
    return null;
  }

  if (row.white_player_id === userId && !row.black_player_id) {
    return 'waiting_seat';
  }

  if (row.white_player_id && row.black_player_id) {
    return 'seated_live_game';
  }

  return null;
}
