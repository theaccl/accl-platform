import { clockBudgetMsForGame } from '@/lib/gameTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';

/** Minimal game row shape for live/daily clock expiry (server list filters + game page parity). */
export type LiveClockExpiryRow = {
  tempo?: string | null;
  status?: string | null;
  turn?: string | null;
  last_move_at?: string | null;
  white_player_id?: string | null;
  black_player_id?: string | null;
  white_clock_ms?: number | null;
  black_clock_ms?: number | null;
  live_time_control?: string | null;
};

export type LiveClockTimeoutState = {
  applies: boolean;
  flaggedLoser: 'white' | 'black' | null;
  whiteMs: number;
  blackMs: number;
};

function bothPlayersSeated(g: LiveClockExpiryRow): boolean {
  const w = String(g.white_player_id ?? '').trim();
  const b = String(g.black_player_id ?? '').trim();
  return w.length > 0 && b.length > 0 && w !== b;
}

/**
 * Live/daily clock model — mirrors `liveDailyClockTimeoutState` on the game page.
 * `flaggedLoser` is the side to move when their remaining time is <= 0.
 */
export function liveDailyClockTimeoutState(
  g: LiveClockExpiryRow,
  nowMs: number,
): LiveClockTimeoutState {
  const t = normalizeGameTempo(g.tempo);
  if (t !== 'live' && t !== 'daily') {
    return { applies: false, flaggedLoser: null, whiteMs: 0, blackMs: 0 };
  }
  if (
    !bothPlayersSeated(g) ||
    g.status === 'finished' ||
    g.status !== 'active' ||
    !g.last_move_at
  ) {
    return { applies: false, flaggedLoser: null, whiteMs: 0, blackMs: 0 };
  }

  const base = clockBudgetMsForGame(g.tempo, g.live_time_control);
  const whiteStored = Number.isFinite(g.white_clock_ms) ? Number(g.white_clock_ms) : base;
  const blackStored = Number.isFinite(g.black_clock_ms) ? Number(g.black_clock_ms) : base;
  const lastMoveMs = new Date(g.last_move_at).getTime();
  if (!Number.isFinite(lastMoveMs)) {
    return { applies: false, flaggedLoser: null, whiteMs: 0, blackMs: 0 };
  }

  const elapsed = Math.max(0, nowMs - lastMoveMs);
  const turn = String(g.turn ?? '').toLowerCase();
  const activeStored = turn === 'black' ? blackStored : whiteStored;
  const activeRemaining = activeStored - elapsed;

  let flagged: 'white' | 'black' | null = null;
  if (turn === 'white' && activeRemaining <= 0) flagged = 'white';
  else if (turn === 'black' && activeRemaining <= 0) flagged = 'black';

  const whiteMs = turn === 'white' ? Math.max(0, activeRemaining) : whiteStored;
  const blackMs = turn === 'black' ? Math.max(0, activeRemaining) : blackStored;

  return {
    applies: true,
    flaggedLoser: flagged,
    whiteMs,
    blackMs,
  };
}

/** True when the side to move has no time left (game should not appear as live/watchable). */
export function isLiveGameClockExpired(g: LiveClockExpiryRow, nowMs: number = Date.now()): boolean {
  const state = liveDailyClockTimeoutState(g, nowMs);
  return state.applies && state.flaggedLoser !== null;
}

/** Inverse helper for spectator/live discovery lists. */
export function isLiveGameWatchableByClock(g: LiveClockExpiryRow, nowMs: number = Date.now()): boolean {
  return !isLiveGameClockExpired(g, nowMs);
}
