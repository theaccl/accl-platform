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

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false } },
  );
}

test.describe('Phase 1 — tournament ↔ free-play coexistence (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('tournament game excluded from free busy; join guard rejects tournament open seat', async () => {
    const supabase = serviceClient();
    const { data: profiles } = await supabase.from('profiles').select('id').limit(4);
    expect((profiles ?? []).length).toBeGreaterThanOrEqual(3);
    const ids = (profiles ?? []).map((r) => String(r.id));
    const [p1, p2, p3, p4] = ids;

    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

    const { data: tournament } = await supabase
      .from('tournaments')
      .insert({
        name: `IT coexist ${Date.now()}`,
        status: 'pending',
        format: 'single_elimination',
        tempo: 'live',
        rated: false,
        created_by: creator!.id,
        ecosystem_scope: 'adult',
      })
      .select('id')
      .single();
    const tournamentId = tournament!.id as string;

    await supabase.from('tournament_entries').insert(
      [p1, p2, p3, p4].map((user_id) => ({ tournament_id: tournamentId, user_id })),
    );

    const { matchRows } = await persistTournamentBracket(supabase, tournamentId, [p1, p2, p3, p4]);
    const p1Match = matchRows.find((m) => m.player1_id === p1 || m.player2_id === p1)!;
    expect(p1Match.game_id).toBeTruthy();
    const tGameId = p1Match.game_id!;

    const { data: freeOpen } = await supabase
      .from('games')
      .insert({
        white_player_id: p1,
        black_player_id: null,
        status: 'active',
        fen: START_FEN,
        turn: 'white',
        play_context: 'free',
        tempo: 'live',
        live_time_control: '5+5',
        rated: false,
      })
      .select('id')
      .single();

    const { data: busy } = await supabase
      .from('games')
      .select('id')
      .eq('play_context', 'free')
      .is('tournament_id', null)
      .in('status', ['active', 'waiting'])
      .or(`white_player_id.eq.${p1},black_player_id.eq.${p1}`);
    const busyIds = (busy ?? []).map((r) => r.id);
    expect(busyIds).toContain(freeOpen!.id);
    expect(busyIds).not.toContain(tGameId);

    const { data: tRow } = await supabase
      .from('games')
      .select('play_context, tournament_id')
      .eq('id', tGameId)
      .single();
    expect(tRow?.play_context).toBe('tournament');
    expect(tRow?.tournament_id).toBeTruthy();

    const { error: joinErr } = await supabase.rpc('create_seated_game_guard', {
      existing_open_seat_id: tGameId,
      payload: { black_player_id: p2 },
    });
    expect(joinErr).toBeTruthy();
    const msg = joinErr?.message ?? '';
    expect(msg.includes('not a free-play open seat') || msg.includes('not authenticated')).toBe(true);

    const { data: snap } = await supabase.rpc('get_public_spectate_game_snapshot', {
      p_game_id: tGameId,
      p_viewer_ecosystem: 'adult',
    });
    expect(snap).not.toBeNull();

    if (!process.env.TOURNAMENT_COEXISTENCE_KEEP) {
      await supabase.from('games').delete().in('id', [tGameId, freeOpen!.id]);
      await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournaments').delete().eq('id', tournamentId);
    }
  });
});
