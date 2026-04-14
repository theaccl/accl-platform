/**
 * Free-play Find Match — **single client path** for open-seat discovery + creation.
 *
 * - Join: `createSeatedGameGuard` on another user’s open seat (`status = 'active'`, `black_player_id` null).
 * - Create: `openSeatNewGameInsert` + **only** `supabase.from('games').insert(...)` allowed for this flow elsewhere in app code.
 *
 * Do not add alternate `games.insert` matchmaking paths; E2E depends on both players converging on one `games.id`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSeatedGameGuard } from '@/lib/createSeatedFreePlayGame';
import { openSeatNewGameInsert } from '@/lib/gameStartupInsert';
import type { GameTempo } from '@/lib/gameTempo';
import {
  canonicalLiveTimeControlForInsert,
  type DailyClockValue,
  type LiveClockValue,
} from '@/lib/gameTimeControl';

export type PlatMode = 'bullet' | 'blitz' | 'rapid' | 'daily';

export type FreePlayFindMatchArgs = {
  userId: string;
  mode: PlatMode;
  clock: LiveClockValue;
  rated: boolean;
};

function buildOpenSeatRow(
  userId: string,
  mode: PlatMode,
  clock: LiveClockValue,
  rated: boolean
): Record<string, unknown> {
  const base = openSeatNewGameInsert(userId, { rated });
  if (mode === 'daily') {
    const dailyClock: DailyClockValue = clock === '5m' || clock === '10m' ? '60m' : '30m';
    const ltc = canonicalLiveTimeControlForInsert('daily', dailyClock) ?? dailyClock;
    return { ...base, tempo: 'daily' as GameTempo, live_time_control: ltc };
  }
  const ltc = canonicalLiveTimeControlForInsert('live', clock) ?? clock;
  return { ...base, tempo: 'live' as GameTempo, live_time_control: ltc };
}

/**
 * Find Match: join another user's free open seat if one exists; else create a new open seat.
 * Matches E2E helpers that expect two players to converge on the same `games.id`.
 */
export async function runFreePlayFindMatch(
  supabase: SupabaseClient,
  args: FreePlayFindMatchArgs
): Promise<{ gameId: string } | { error: string }> {
  const { userId, mode, clock, rated } = args;

  const { data: candidates, error: qErr } = await supabase
    .from('games')
    .select('id')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .eq('status', 'active')
    .is('black_player_id', null)
    .neq('white_player_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (qErr) {
    return { error: qErr.message || 'Could not look up open seats.' };
  }

  const openSeatId = candidates?.[0]?.id as string | undefined;

  if (openSeatId) {
    const { data: joined, error: joinErr } = await createSeatedGameGuard(supabase, {
      existingOpenSeatId: openSeatId,
      row: { black_player_id: userId },
    });
    if (!joinErr && joined && typeof joined === 'object' && 'id' in joined && (joined as { id: string }).id) {
      return { gameId: (joined as { id: string }).id };
    }
    // Race or policy: create a new open seat instead of failing the flow.
  }

  const row = buildOpenSeatRow(userId, mode, clock, rated);
  const { data: created, error: insErr } = await supabase.from('games').insert(row).select('id').single();
  if (insErr) {
    return { error: insErr.message || 'Could not create open seat.' };
  }
  const id = created?.id as string | undefined;
  if (!id) return { error: 'Could not start matchmaking.' };
  return { gameId: id };
}
