/**
 * Free-play queue — three distinct operations (do not blend):
 *
 * - **Open queue (UI):** list + manual Accept → join one seat (`FreeLobbyOpenGamesList` + `createSeatedGameGuard`).
 * - **Create game:** post a new open seat only (`runFreePlayCreateGame`).
 * - **Find match:** join a random compatible open seat if any; otherwise **post** an open seat (same as Create) and wait.
 *
 * Integrity: RLS limits cross-user visibility; server RPCs enforce busy rules (see migrations).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSeatedGameGuard } from '@/lib/createSeatedFreePlayGame';
import { openSeatNewGameInsert } from '@/lib/gameStartupInsert';
import type { GameTempo } from '@/lib/gameTempo';
import { normalizeGameTempo } from '@/lib/gameTempo';
import {
  type PlatMode,
  coercePlatTimeForMode,
  isValidPlatTimeForMode,
} from '@/lib/freePlayModeTimeControl';
import { openSeatMatchesPlatClock, openSeatMatchesRated } from '@/lib/freePlayOpenSeatsFilter';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import { rowIndicatesLiveFreePlayPacing } from '@/lib/freePlayLiveSession';
import { LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE } from '@/lib/liveChallengeAcceptGuard';

export type { PlatMode } from '@/lib/freePlayModeTimeControl';

export type FreePlayQueueArgs = {
  userId: string;
  mode: PlatMode;
  clock: string;
  rated: boolean;
};

export type FreePlayQueueResult =
  | { gameId: string; /** True when this session just **posted** a live open seat (not joined someone else's). */ hostLiveOpenSeat?: boolean }
  | { error: string; resumeGameId?: string; suggestCreate?: boolean }; // suggestCreate reserved for non–find-match errors

type OpenSeatCandidate = {
  id: string;
  white_player_id: string;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
};

/** Shown when Create / Find / manual accept would violate one-active-or-waiting rule. */
export const FREE_PLAY_QUEUE_BUSY_MESSAGE =
  'You already have an active or waiting game. Leave that seat or resume that game before joining another.';

function buildOpenSeatRow(
  userId: string,
  mode: PlatMode,
  clock: string,
  rated: boolean
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

/** Client-side gate: same rules as Create / Find before navigating to accept an open seat. */
export async function checkUserFreePlayQueueEligible(
  supabase: SupabaseClient,
  userId: string,
  targetTempo?: GameTempo
): Promise<{ ok: true } | { error: string; resumeGameId?: string }> {
  const { data: mine, error: mineErr } = await supabase
    .from('games')
    .select('id,white_player_id,black_player_id,tempo,live_time_control')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (mineErr) {
    return { error: mineErr.message || 'Could not verify your active games.' };
  }

  if (normalizeGameTempo(targetTempo) === 'live') {
    const liveBusy = (mine ?? []).find((g) => {
      const row = g as { tempo?: string | null; live_time_control?: string | null };
      if (!rowIndicatesLiveFreePlayPacing(row)) return false;
      const w = g.white_player_id;
      const b = g.black_player_id;
      if (w && b) return true;
      return w === userId || b === userId;
    });
    if (liveBusy?.id) {
      return { error: LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE, resumeGameId: liveBusy.id };
    }
  }

  for (const g of mine ?? []) {
    const w = g.white_player_id;
    const b = g.black_player_id;
    if (w && b) {
      return { error: FREE_PLAY_QUEUE_BUSY_MESSAGE, resumeGameId: g.id };
    }
    if (w === userId && !b) {
      return { error: FREE_PLAY_QUEUE_BUSY_MESSAGE, resumeGameId: g.id };
    }
    if (b === userId && !w) {
      return { error: FREE_PLAY_QUEUE_BUSY_MESSAGE, resumeGameId: g.id };
    }
  }

  return { ok: true };
}

/**
 * Drop open seats whose White is already in another full free game (same rule as Find Match).
 */
export async function filterOpenSeatRowsExcludingBusyHosts<T extends { white_player_id: string }>(
  supabase: SupabaseClient,
  rows: T[]
): Promise<{ rows: T[]; error: string | null }> {
  if (rows.length === 0) {
    return { rows: [], error: null };
  }

  const whiteIds = [...new Set(rows.map((r) => r.white_player_id))];
  const { data: wBusy, error: wErr } = await supabase
    .from('games')
    .select('white_player_id')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .not('black_player_id', 'is', null)
    .in('white_player_id', whiteIds);

  const { data: bBusy, error: bErr } = await supabase
    .from('games')
    .select('black_player_id')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .not('black_player_id', 'is', null)
    .in('black_player_id', whiteIds);

  if (wErr || bErr) {
    return { rows: [], error: (wErr ?? bErr)?.message || 'Could not validate open seats.' };
  }

  const busy = new Set<string>([
    ...(wBusy ?? []).map((r) => r.white_player_id as string),
    ...(bBusy ?? []).map((r) => r.black_player_id as string),
  ]);

  return { rows: rows.filter((r) => !busy.has(r.white_player_id)), error: null };
}

/**
 * Fetch OpenQ: active free open seats, excluding self, then filter by mode/clock/rated and busy hosts (RLS-best-effort).
 */
export async function fetchCompatibleOpenSeats(
  supabase: SupabaseClient,
  args: FreePlayQueueArgs
): Promise<{ rows: OpenSeatCandidate[]; error: string | null }> {
  const { userId, mode, clock, rated } = args;
  const normalizedClock = coercePlatTimeForMode(mode, clock);

  const { data: candidates, error: qErr } = await supabase
    .from('games')
    .select('id,white_player_id,tempo,live_time_control,rated')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .eq('status', 'active')
    .is('black_player_id', null)
    .neq('white_player_id', userId)
    .order('created_at', { ascending: true })
    .limit(80);

  if (qErr) {
    return { rows: [], error: qErr.message || 'Could not look up open seats.' };
  }

  let rows = (candidates ?? []) as OpenSeatCandidate[];

  const { rows: afterBusy, error: busyErr } = await filterOpenSeatRowsExcludingBusyHosts(supabase, rows);
  if (busyErr) {
    return { rows: [], error: busyErr };
  }
  rows = afterBusy;

  const compatible = rows.filter(
    (r) => openSeatMatchesPlatClock(r, mode, normalizedClock) && openSeatMatchesRated(r, rated),
  );

  return { rows: compatible, error: null };
}

/**
 * **Create game** — post a new open seat into OpenQ only (never joins an existing seat).
 */
export async function runFreePlayCreateGame(
  supabase: SupabaseClient,
  args: FreePlayQueueArgs
): Promise<FreePlayQueueResult> {
  const { userId, mode, clock, rated } = args;

  const normalizedClock = coercePlatTimeForMode(mode, clock);
  if (!isValidPlatTimeForMode(mode, normalizedClock)) {
    return { error: 'Invalid time control for the selected mode.' };
  }

  const gate = await checkUserFreePlayQueueEligible(supabase, userId, mode === 'daily' ? 'daily' : 'live');
  if (!('ok' in gate)) {
    return { error: gate.error, resumeGameId: gate.resumeGameId };
  }

  const row = buildOpenSeatRow(userId, mode, normalizedClock, rated);
  const { data: created, error: insErr } = await supabase.from('games').insert(row).select('id').single();
  if (insErr) {
    return { error: insErr.message || 'Could not create open seat.' };
  }
  const id = created?.id as string | undefined;
  if (!id) return { error: 'Could not post to the queue.' };
  return { gameId: id, hostLiveOpenSeat: mode !== 'daily' };
}

/**
 * **Find match** — join a random compatible open seat if one exists; otherwise post a new open seat (same as Create) and wait.
 */
export async function runFreePlayFindMatchAutomatic(
  supabase: SupabaseClient,
  args: FreePlayQueueArgs
): Promise<FreePlayQueueResult> {
  const { userId, mode, clock, rated } = args;

  const normalizedClock = coercePlatTimeForMode(mode, clock);
  if (!isValidPlatTimeForMode(mode, normalizedClock)) {
    return { error: 'Invalid time control for the selected mode.' };
  }

  const gate = await checkUserFreePlayQueueEligible(supabase, userId, mode === 'daily' ? 'daily' : 'live');
  if (!('ok' in gate)) {
    return { error: gate.error, resumeGameId: gate.resumeGameId };
  }

  const { rows, error: fetchErr } = await fetchCompatibleOpenSeats(supabase, {
    userId,
    mode,
    clock: normalizedClock,
    rated,
  });

  if (fetchErr) {
    return { error: fetchErr };
  }

  if (rows.length === 0) {
    return runFreePlayCreateGame(supabase, args);
  }

  const pick = rows[Math.floor(Math.random() * rows.length)];

  const { data: joined, error: joinErr } = await createSeatedGameGuard(supabase, {
    existingOpenSeatId: pick.id,
    row: { black_player_id: userId },
  });

  if (joinErr) {
    return {
      error: joinErr.message || 'Could not join that seat. Try again or pick a game from Open Games.',
    };
  }

  if (joined && typeof joined === 'object' && 'id' in joined && (joined as { id: string }).id) {
    return { gameId: (joined as { id: string }).id, hostLiveOpenSeat: false };
  }

  return { error: 'Could not complete match. Try again.' };
}
