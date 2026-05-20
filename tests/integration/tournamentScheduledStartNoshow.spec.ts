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

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false } },
  );
}

test.describe('Phase 1 — scheduled start + no-show grace (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('starts_at stored; grace then operator award on absent match', async () => {
    const supabase = serviceClient();
    const { error: colErr } = await supabase.from('tournaments').select('starts_at').limit(1);
    if (colErr?.message?.includes('starts_at')) {
      test.skip(true, 'Apply 20260519165000_tournament_starts_at_additive.sql');
    }

    const { data: profiles } = await supabase.from('profiles').select('id').limit(4);
    expect((profiles ?? []).length).toBeGreaterThanOrEqual(4);
    const [p1, p2, p3, p4] = (profiles ?? []).map((r) => String(r.id));

    const startsAt = new Date(Date.now() + 2000).toISOString();
    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

    const { data: tournament } = await supabase
      .from('tournaments')
      .insert({
        name: `IT scheduled ${Date.now()}`,
        status: 'pending',
        format: 'single_elimination',
        tempo: 'live',
        rated: false,
        created_by: creator!.id,
        ecosystem_scope: 'adult',
        starts_at: startsAt,
      })
      .select('id')
      .single();
    const tournamentId = tournament!.id as string;

    await supabase.from('tournament_entries').insert(
      [p1, p2, p3, p4].map((user_id) => ({ tournament_id: tournamentId, user_id })),
    );

    await new Promise((r) => setTimeout(r, 2200));

    const { matchRows } = await persistTournamentBracket(supabase, tournamentId, [p1, p2, p3, p4]);
    const absentMatch = matchRows.find((m) => m.round_number === 1 && m.player1_id === p1)!;
    expect(absentMatch.game_id).toBeTruthy();

    await new Promise((r) => setTimeout(r, 1000));

    const { data: g } = await supabase.from('games').select('status').eq('id', absentMatch.game_id!).single();
    expect(g?.status).toBe('active');

    const { data: gameRow } = await supabase
      .from('games')
      .select('white_player_id, black_player_id')
      .eq('id', absentMatch.game_id!)
      .single();
    const presentId = gameRow!.white_player_id === p4 ? gameRow!.black_player_id : gameRow!.white_player_id;
    const result = gameRow!.white_player_id === presentId ? 'white_win' : 'black_win';

    await supabase.rpc('finish_game_system', {
      p_game_id: absentMatch.game_id!,
      p_result: result,
      p_end_reason: 'timeout',
    });

    const { data: m } = await supabase
      .from('tournament_matches')
      .select('winner_id')
      .eq('id', absentMatch.id)
      .single();
    expect(m?.winner_id).toBe(presentId);

    if (!process.env.TOURNAMENT_SCHEDULED_KEEP) {
      const gameIds = matchRows.map((m) => m.game_id).filter(Boolean);
      await supabase.from('games').delete().in('id', gameIds);
      await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournaments').delete().eq('id', tournamentId);
    }
  });
});
