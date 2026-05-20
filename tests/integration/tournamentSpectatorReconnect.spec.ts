import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { persistTournamentBracket } from '@/lib/tournamentPersist';

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

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false } },
  );
}

test.describe('Phase 1 — tournament spectator + reconnect (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('move + spectate RPC + finish preserves ordered logs and finished state', async () => {
    const supabase = serviceClient();
    const { data: profiles } = await supabase.from('profiles').select('id').limit(2);
    expect((profiles ?? []).length).toBeGreaterThanOrEqual(2);
    const [p1, p2] = (profiles ?? []).map((r) => String(r.id));

    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

    const { data: tournament } = await supabase
      .from('tournaments')
      .insert({
        name: `IT spectate ${Date.now()}`,
        status: 'pending',
        format: 'single_elimination',
        tempo: 'live',
        rated: false,
        created_by: creator!.id,
        ecosystem_scope: 'adult',
      })
      .select('id')
      .single();

    await supabase.from('tournament_entries').insert([
      { tournament_id: tournament!.id, user_id: p1 },
      { tournament_id: tournament!.id, user_id: p2 },
    ]);

    const { matchRows } = await persistTournamentBracket(supabase, tournament!.id as string, [p1, p2]);
    const r1 = matchRows.find((m) => m.round_number === 1 && m.game_id);
    expect(r1?.game_id).toBeTruthy();
    const gameId = r1!.game_id!;

    const { error: moveErr } = await supabase.rpc('apply_move_and_maybe_finish_system', {
      p_game_id: gameId,
      p_expected_fen: START_FEN,
      p_next_fen: AFTER_E4_FEN,
      p_next_turn: 'black',
      p_last_move_at: new Date().toISOString(),
      p_move_deadline_at: null,
      p_white_clock_ms: 120000,
      p_black_clock_ms: 120000,
      p_promote_waiting_to_active: false,
      p_result: null,
      p_end_reason: null,
      p_move_log: {
        game_id: gameId,
        player_id: p1,
        san: 'e4',
        from_sq: 'e2',
        to_sq: 'e4',
        fen_before: START_FEN,
        fen_after: AFTER_E4_FEN,
        move_duration_ms: 10,
      },
    });
    expect(moveErr).toBeNull();

    const { data: snap } = await supabase.rpc('get_public_spectate_game_snapshot', {
      p_game_id: gameId,
      p_viewer_ecosystem: 'adult',
    });
    expect(snap?.game?.fen).toBe(AFTER_E4_FEN);
    expect(snap?.game?.turn).toBe('black');
    const logs = (snap?.move_logs ?? []) as { created_at: string; fen_before: string; fen_after: string }[];
    expect(logs.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < logs.length; i++) {
      expect(new Date(logs[i].created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(logs[i - 1].created_at).getTime(),
      );
    }

    const { data: gRow } = await supabase
      .from('games')
      .select('white_player_id')
      .eq('id', gameId)
      .single();
    await supabase.rpc('finish_game_system', {
      p_game_id: gameId,
      p_result: gRow!.white_player_id === p1 ? 'white_win' : 'black_win',
      p_end_reason: 'timeout',
    });

    const { data: post } = await supabase.rpc('get_public_spectate_game_snapshot', {
      p_game_id: gameId,
      p_viewer_ecosystem: 'adult',
    });
    expect(post?.game?.status).toBe('finished');
    expect(post?.game?.winner_id).toBeTruthy();

    await supabase.from('games').delete().eq('id', gameId);
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournament!.id);
    await supabase.from('tournament_entries').delete().eq('tournament_id', tournament!.id);
    await supabase.from('tournaments').delete().eq('id', tournament!.id);
  });
});
