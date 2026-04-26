import { coercePlatTimeForMode, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';
import { normalizeGameTempo } from '@/lib/gameTempo';

/** Target slice for a Create / Find / open-seat pre-check (not global “user busy”). */
export type FreePlayQueueTargetSlot = {
  mode: PlatMode;
  /** PLAT clock id, e.g. 5+5, 10m, 1d. */
  clock: string;
  rated: boolean;
};

export function freePlayTargetSlot(
  mode: PlatMode,
  clock: string,
  rated: boolean
): FreePlayQueueTargetSlot {
  return { mode, clock, rated: rated === true };
}

function canonicalLtcString(mode: PlatMode, rawClock: string): string {
  const t = mode === 'daily' ? 'daily' : 'live';
  const co = coercePlatTimeForMode(mode, rawClock);
  return String(canonicalLiveTimeControlForInsert(t, co) ?? co)
    .toLowerCase()
    .trim();
}

type MinimalGameForSlot = {
  id?: string;
  white_player_id: string | null;
  black_player_id: string | null;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
  status?: string | null;
};

function userParticipates(userId: string, g: MinimalGameForSlot): boolean {
  const w = g.white_player_id;
  const b = g.black_player_id;
  return w === userId || b === userId;
}

function isSeatedTwoPlayer(g: MinimalGameForSlot): boolean {
  return Boolean(g.white_player_id && g.black_player_id);
}

function isActiveOrWaiting(g: MinimalGameForSlot): boolean {
  const s = String(g.status ?? '');
  return s === 'active' || s === 'waiting';
}

/**
 * New queue actions allow multiple Daily games: never block another daily / live pair by daily.
 */
function slotBlocksAgainstGameRow(
  userId: string,
  g: MinimalGameForSlot,
  target: FreePlayQueueTargetSlot,
  opts: { requireSeated?: boolean }
): boolean {
  if (!isActiveOrWaiting(g)) return false;
  if (!userParticipates(userId, g)) return false;
  if (target.mode === 'daily') {
    // Multiple daily — not slot-blocked in this free-play model.
    return false;
  }

  const gMode = platBucketForOpenSeat(g.tempo, g.live_time_control);
  if (gMode == null) return false;
  if (gMode === 'daily' || gMode !== target.mode) {
    // Existing daily, or a different live bucket — does not block a new non-daily post.
    return false;
  }

  const tNorm = String(normalizeGameTempo(g.tempo) === 'daily' ? 'daily' : 'live') as 'daily' | 'live';
  const gLtc = String(
    canonicalLiveTimeControlForInsert(
      tNorm,
      g.live_time_control
    ) ?? (g.live_time_control ?? '')
  )
    .toLowerCase()
    .trim();
  if (gLtc !== canonicalLtcString(target.mode, target.clock)) return false;

  const gRated = g.rated === true;
  if (gRated !== target.rated) return false;

  if (opts.requireSeated) {
    return isSeatedTwoPlayer(g);
  }

  // Open seat: host waiting alone, or both seated, blocks same slot.
  if (isSeatedTwoPlayer(g)) return true;
  const w = g.white_player_id;
  const b = g.black_player_id;
  if (w && !b && w === userId) return true;
  if (b && !w && b === userId) return true;
  return false;
}

/** Open-seat + seated rules for create/find/open-games gate (excludes unscoped daily). */
export function freePlayUserBlockedForTargetSlot(
  userId: string,
  g: MinimalGameForSlot,
  target: FreePlayQueueTargetSlot
): boolean {
  if (target.mode === 'daily') {
    // Multiple daily: never block in this path.
    return false;
  }
  return slotBlocksAgainstGameRow(userId, g, target, { requireSeated: false });
}

export function freePlayUserSeatedInConflictingSlot(
  userId: string,
  g: MinimalGameForSlot,
  target: FreePlayQueueTargetSlot
): boolean {
  if (target.mode === 'daily') {
    return false;
  }
  return slotBlocksAgainstGameRow(userId, g, target, { requireSeated: true });
}

/**
 * For listing open seats: drop rows whose host (white) is in a two-player game in the **same** PLAT slot.
 * Cross-mode and cross-clock hosts stay visible.
 */
export function openSeatRowHostSeatedConflictsInSameSlot(
  openRow: {
    white_player_id: string;
    tempo: string | null;
    live_time_control: string | null;
    rated?: boolean | null;
  },
  hostSeatedRow: {
    white_player_id: string | null;
    black_player_id: string | null;
    tempo: string | null;
    live_time_control: string | null;
    rated: boolean | null;
  }
): boolean {
  if (!openRow.white_player_id) return false;
  const w = String(openRow.white_player_id);
  if (hostSeatedRow.white_player_id !== w && hostSeatedRow.black_player_id !== w) return false;
  if (!isSeatedTwoPlayer(hostSeatedRow)) return false;
  if (!isActiveOrWaiting(hostSeatedRow)) return false;

  const m = platBucketForOpenSeat(openRow.tempo, openRow.live_time_control);
  if (m == null) return false;
  if (m === 'daily') {
    // Multiple daily — do not hide a host for another daily/cross daily.
    return false;
  }

  return slotBlocksAgainstGameRow(
    w,
    {
      id: (hostSeatedRow as { id?: string }).id,
      white_player_id: hostSeatedRow.white_player_id,
      black_player_id: hostSeatedRow.black_player_id,
      tempo: hostSeatedRow.tempo,
      live_time_control: hostSeatedRow.live_time_control,
      rated: hostSeatedRow.rated,
    },
    freePlayTargetSlot(
      m,
      coercePlatTimeForMode(m, String(openRow.live_time_control ?? '')),
      openRow.rated === true
    ),
    { requireSeated: true }
  );
}
