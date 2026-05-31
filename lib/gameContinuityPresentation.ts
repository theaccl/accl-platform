import { rowIndicatesLiveFreePlayPacing } from '@/lib/freePlayLiveSession';
import { normalizeGameTempo } from '@/lib/gameTempo';

/** Hash anchors on `/free/active` for deep links. */
export const GAME_CONTINUITY_LIVE_ANCHOR = 'live';
export const GAME_CONTINUITY_ASYNC_ANCHOR = 'async';

export const FREE_ACTIVE_GAMES_PATH = '/free/active';

export function freeActiveGamesHref(section?: 'live' | 'async'): string {
  if (section === 'live') return `${FREE_ACTIVE_GAMES_PATH}#${GAME_CONTINUITY_LIVE_ANCHOR}`;
  if (section === 'async') return `${FREE_ACTIVE_GAMES_PATH}#${GAME_CONTINUITY_ASYNC_ANCHOR}`;
  return FREE_ACTIVE_GAMES_PATH;
}

export const LIVE_NOW_SECTION_TITLE = 'LIVE NOW';
export const LIVE_NOW_SECTION_HINT =
  'Reconnect while the clock is running — seated live boards only; clocks keep running while you reconnect.';
export const OPEN_LIVE_SEATS_SECTION_TITLE = 'OPEN LIVE SEATS';
export const OPEN_LIVE_SEATS_SECTION_HINT =
  'Waiting for opponent — posted invitations until someone joins.';
export const DAILY_ASYNC_SECTION_TITLE = 'DAILY / ASYNC GAMES';
export const DAILY_ASYNC_SECTION_HINT = 'Your turn when ready — these games stay on your queue until finished.';

export type GameContinuityRow = {
  id: string;
  status: string;
  tempo: string | null;
  live_time_control?: string | null;
  rated?: boolean | null;
  turn?: string | null;
  white_player_id: string;
  black_player_id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

/** Neutral pre-start cancel for unmatched open seats (existing lifecycle void reason — no migration). */
export const NEUTRAL_OPEN_SEAT_CANCEL_FINISH = {
  p_result: 'draw' as const,
  p_end_reason: 'abandoned_before_move' as const,
};

/** Live bullet/blitz/rapid continuity (reconnect-oriented, not indefinite parking). */
export function isLiveContinuityGame(row: Pick<GameContinuityRow, 'tempo' | 'live_time_control'>): boolean {
  return rowIndicatesLiveFreePlayPacing(row);
}

/** Daily, correspondence, and other non-live pacing (persistence-native). */
export function isDailyAsyncContinuityGame(row: Pick<GameContinuityRow, 'tempo' | 'live_time_control'>): boolean {
  return !isLiveContinuityGame(row);
}

export function isOpenSeatRow(row: Pick<GameContinuityRow, 'black_player_id'>): boolean {
  return !row.black_player_id;
}

export function partitionGamesByContinuity<T extends GameContinuityRow>(rows: T[]): {
  live: T[];
  dailyAsync: T[];
} {
  const live: T[] = [];
  const dailyAsync: T[] = [];
  for (const row of rows) {
    if (isLiveContinuityGame(row)) {
      live.push(row);
    } else {
      dailyAsync.push(row);
    }
  }
  return { live, dailyAsync };
}

/** Split live-paced rows into unmatched waiting seats vs seated boards. */
export function splitLiveContinuityRows<T extends GameContinuityRow>(live: T[]): {
  openLive: T[];
  seatedLive: T[];
} {
  const openLive: T[] = [];
  const seatedLive: T[] = [];
  for (const row of live) {
    if (isOpenSeatRow(row)) openLive.push(row);
    else seatedLive.push(row);
  }
  return { openLive, seatedLive };
}

/** CTA label on a game row — live emphasizes reconnect, async emphasizes queue resume. */
export function continuityRowActionLabel(row: Pick<GameContinuityRow, 'tempo' | 'live_time_control' | 'black_player_id'>): string {
  if (!row.black_player_id) {
    return isLiveContinuityGame(row) ? 'Waiting for opponent' : 'Open daily seat';
  }
  return isLiveContinuityGame(row) ? 'Return to board' : 'Resume daily game';
}

/** Short tempo bucket for empty-state copy. */
export function continuityTempoBucket(row: Pick<GameContinuityRow, 'tempo'>): 'live' | 'daily' | 'correspondence' | 'other' {
  const t = normalizeGameTempo(row.tempo);
  if (t === 'live') return 'live';
  if (t === 'daily') return 'daily';
  if (t === 'correspondence') return 'correspondence';
  return 'other';
}

/** In-game nav link to the correct `/free/active` section. */
export function inGameContinuityHubLink(
  row: Pick<GameContinuityRow, 'tempo' | 'live_time_control'>,
): { href: string; label: string } {
  if (isLiveContinuityGame(row)) {
    return { href: freeActiveGamesHref('live'), label: 'Your live games' };
  }
  const bucket = continuityTempoBucket(row);
  if (bucket === 'daily' || bucket === 'correspondence') {
    return { href: freeActiveGamesHref('async'), label: 'Your daily games' };
  }
  return { href: FREE_ACTIVE_GAMES_PATH, label: 'Your games' };
}

export const LIVE_QUEUE_BUSY_HINT =
  ' Return to your live board from Lobby Chat or open your live games list.';
export const DAILY_QUEUE_BUSY_HINT =
  ' Open your daily games list from Lobby Chat when you are ready to play.';
