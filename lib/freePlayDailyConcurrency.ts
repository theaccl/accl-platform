/**
 * Free-play Daily concurrency (client-side guard; RLS/RPC do not enforce these caps yet).
 *
 * - Rated: at most 5 obligations (waiting open seats + seated ongoing), all Daily controls.
 * - Unrated: unlimited seated ongoing; at most 5 host waiting open seats (queue posts only).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeGameTempo } from '@/lib/gameTempo';

export const RATED_DAILY_OBLIGATION_CAP = 5;
export const UNRATED_DAILY_WAITING_QUEUE_CAP = 5;

export const RATED_DAILY_CAP_MESSAGE =
  'You already have 5 rated Daily games in progress or waiting. Finish one before joining another rated Daily game.';

export const UNRATED_DAILY_QUEUE_CAP_MESSAGE =
  'You already have 5 unrated Daily games waiting in queue. Close one before posting another unrated Daily seat.';

/** How Daily caps apply for a queue action. */
export type DailyConcurrencyAction = 'post_queue' | 'join_or_accept';

export type DailyConcurrencyRow = {
  id?: string;
  white_player_id: string | null;
  black_player_id: string | null;
  tempo: string | null;
  live_time_control?: string | null;
  rated?: boolean | null;
  status?: string | null;
  end_reason?: string | null;
  play_context?: string | null;
  tournament_id?: string | null;
};

function userParticipates(userId: string, row: DailyConcurrencyRow): boolean {
  return row.white_player_id === userId || row.black_player_id === userId;
}

function isActiveOrWaitingStatus(row: DailyConcurrencyRow): boolean {
  const s = String(row.status ?? '').toLowerCase();
  return s === 'active' || s === 'waiting';
}

/** Base row eligible for Daily concurrency counting (free async, non-terminal). */
export function isDailyConcurrencyCountableRow(row: DailyConcurrencyRow): boolean {
  if (String(row.play_context ?? 'free') !== 'free') return false;
  if (row.tournament_id) return false;
  if (normalizeGameTempo(row.tempo) !== 'daily') return false;
  if (!isActiveOrWaitingStatus(row)) return false;
  return true;
}

/** Rated waiting + seated ongoing Daily games for a participant (global across controls). */
export function countsAsRatedDailyObligation(row: DailyConcurrencyRow, userId: string): boolean {
  if (!isDailyConcurrencyCountableRow(row)) return false;
  if (row.rated !== true) return false;
  return userParticipates(userId, row);
}

/** Unrated host-only open seats (queue posts); seated ongoing does not count. */
export function countsAsUnratedDailyWaitingSeat(row: DailyConcurrencyRow, userId: string): boolean {
  if (!isDailyConcurrencyCountableRow(row)) return false;
  if (row.rated === true) return false;
  if (row.white_player_id !== userId) return false;
  if (row.black_player_id) return false;
  return true;
}

export function countRatedDailyObligations(rows: DailyConcurrencyRow[], userId: string): number {
  let n = 0;
  for (const row of rows) {
    if (countsAsRatedDailyObligation(row, userId)) n += 1;
  }
  return n;
}

export function countUnratedDailyWaitingSeats(rows: DailyConcurrencyRow[], userId: string): number {
  let n = 0;
  for (const row of rows) {
    if (countsAsUnratedDailyWaitingSeat(row, userId)) n += 1;
  }
  return n;
}

export async function fetchUserDailyConcurrencyRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: DailyConcurrencyRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('games')
    .select(
      'id,white_player_id,black_player_id,tempo,live_time_control,rated,status,end_reason,play_context,tournament_id',
    )
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .eq('tempo', 'daily')
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
    .limit(120);

  if (error) {
    return { rows: [], error: error.message || 'Could not verify your Daily games.' };
  }
  return { rows: (data ?? []) as DailyConcurrencyRow[], error: null };
}

/**
 * Enforce Daily caps before create / find post / accept / direct challenge accept.
 * Unrated accept/join never blocks on seated-game volume.
 */
export async function assertUserDailyConcurrencyAllowed(
  supabase: SupabaseClient,
  userId: string,
  args: { rated: boolean; action: DailyConcurrencyAction },
): Promise<{ ok: true } | { error: string }> {
  const { rows, error } = await fetchUserDailyConcurrencyRows(supabase, userId);
  if (error) return { error };

  if (args.rated) {
    const n = countRatedDailyObligations(rows, userId);
    if (n >= RATED_DAILY_OBLIGATION_CAP) {
      return { error: RATED_DAILY_CAP_MESSAGE };
    }
    return { ok: true };
  }

  if (args.action === 'join_or_accept') {
    return { ok: true };
  }

  const waiting = countUnratedDailyWaitingSeats(rows, userId);
  if (waiting >= UNRATED_DAILY_WAITING_QUEUE_CAP) {
    return { error: UNRATED_DAILY_QUEUE_CAP_MESSAGE };
  }
  return { ok: true };
}
