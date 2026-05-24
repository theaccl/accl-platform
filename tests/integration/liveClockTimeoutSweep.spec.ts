import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isLiveGameClockExpired } from '@/lib/liveClockExpiry';
import { START_FEN } from '@/lib/startFen';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0 && !process.env[t.slice(0, i).trim()]) {
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
}

loadEnvLocal();

const hasDb =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false } },
  );
}

async function rpcAvailable(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.rpc('expire_live_clock_timeouts', { p_batch: 0 });
  if (!error) return true;
  const msg = error.message.toLowerCase();
  return !msg.includes('could not find the function') && !msg.includes('does not exist');
}

async function twoProfileIds(supabase: SupabaseClient): Promise<[string, string]> {
  const { data } = await supabase.from('profiles').select('id').limit(2);
  const ids = (data ?? []).map((r) => String(r.id));
  expect(ids.length).toBeGreaterThanOrEqual(2);
  return [ids[0]!, ids[1]!];
}

test.describe('live clock timeout sweep (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('expires active free live game when side to move is out of time', async () => {
    const supabase = serviceClient();
    test.skip(!(await rpcAvailable(supabase)), 'Apply migration 20260602120000_expire_live_clock_timeouts first');

    const [whiteId, blackId] = await twoProfileIds(supabase);
    const lastMoveAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const row = {
      white_player_id: whiteId,
      black_player_id: blackId,
      status: 'active' as const,
      fen: START_FEN,
      turn: 'white' as const,
      play_context: 'free' as const,
      tempo: 'live' as const,
      live_time_control: '2+1',
      rated: false,
      white_clock_ms: 60_000,
      black_clock_ms: 120_000,
      last_move_at: lastMoveAt,
    };

    expect(
      isLiveGameClockExpired(
        {
          tempo: row.tempo,
          status: row.status,
          turn: row.turn,
          last_move_at: lastMoveAt,
          white_player_id: whiteId,
          black_player_id: blackId,
          white_clock_ms: row.white_clock_ms,
          black_clock_ms: row.black_clock_ms,
          live_time_control: row.live_time_control,
        },
        Date.now(),
      ),
    ).toBe(true);

    const { data: inserted, error: insErr } = await supabase.from('games').insert(row).select('id').single();
    expect(insErr).toBeNull();
    const gameId = String(inserted!.id);

    try {
      const { data: firstCount, error: sweepErr } = await supabase.rpc('expire_live_clock_timeouts', {
        p_batch: 25,
      });
      expect(sweepErr).toBeNull();
      expect(firstCount).toBeGreaterThanOrEqual(1);

      const { data: game, error: gErr } = await supabase
        .from('games')
        .select('status,result,end_reason')
        .eq('id', gameId)
        .single();
      expect(gErr).toBeNull();
      expect(game?.status).toBe('finished');
      expect(game?.result).toBe('black_win');
      expect(game?.end_reason).toBe('timeout');

      const { data: secondCount, error: againErr } = await supabase.rpc('expire_live_clock_timeouts', {
        p_batch: 25,
      });
      expect(againErr).toBeNull();
      expect(secondCount).toBe(0);
    } finally {
      await supabase.from('games').delete().eq('id', gameId);
    }
  });
});
