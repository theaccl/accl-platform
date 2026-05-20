import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { matchKey, planSingleEliminationBracket } from '@/lib/tournamentBracket';
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

async function resolveFourIds(supabase: SupabaseClient): Promise<string[]> {
  const raw = process.env.PHASE_1_4P_PLAYER_IDS?.trim();
  if (raw) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    expect(ids).toHaveLength(4);
    return ids;
  }
  const { data } = await supabase.from('profiles').select('id').limit(4);
  const ids = (data ?? []).map((r) => String(r.id));
  expect(ids.length).toBeGreaterThanOrEqual(4);
  return ids.slice(0, 4);
}

async function finishAsWinner(supabase: SupabaseClient, gameId: string, winnerId: string) {
  const { data: g } = await supabase
    .from('games')
    .select('white_player_id, black_player_id, status')
    .eq('id', gameId)
    .single();
  if (g?.status === 'finished') return;
  const result = g?.white_player_id === winnerId ? 'white_win' : 'black_win';
  const { error } = await supabase.rpc('finish_game_system', {
    p_game_id: gameId,
    p_result: result,
    p_end_reason: 'checkmate',
  });
  expect(error).toBeNull();
}

test.describe('Phase 1 — 4-player KO (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('registration → bracket → R1 → final → champion', async () => {
    const supabase = serviceClient();
    const players = await resolveFourIds(supabase);
    const [p1, p2, p3, p4] = players;

    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();
    expect(creator?.id).toBeTruthy();

    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .insert({
        name: `IT 4P KO ${Date.now()}`,
        status: 'pending',
        format: 'single_elimination',
        tempo: 'live',
        rated: false,
        created_by: creator!.id,
        ecosystem_scope: 'adult',
      })
      .select('id')
      .single();
    expect(tErr).toBeNull();
    const tournamentId = tournament!.id as string;

    const { error: entErr } = await supabase.from('tournament_entries').insert(
      players.map((user_id) => ({ tournament_id: tournamentId, user_id })),
    );
    expect(entErr).toBeNull();

    const { matchRows } = await persistTournamentBracket(supabase, tournamentId, players);
    expect(matchRows.length).toBe(3);

    const r1 = matchRows.filter((m) => m.round_number === 1);
    expect(r1).toHaveLength(2);
    for (const m of r1) {
      expect(m.game_id).toBeTruthy();
    }

    const plans = planSingleEliminationBracket(players);
    const r1plan0 = plans.find((p) => p.roundNumber === 1 && p.matchNumber === 0)!;
    const r1plan1 = plans.find((p) => p.roundNumber === 1 && p.matchNumber === 1)!;
    const m0 = r1.find((m) => m.match_number === 0)!;
    const m1 = r1.find((m) => m.match_number === 1)!;

    const semi0Winner = r1plan0.player1Id!;
    const semi1Winner = r1plan1.player1Id!;
    expect(semi0Winner).toBe(p1);
    expect(semi1Winner).toBe(p2);

    await finishAsWinner(supabase, m0.game_id!, semi0Winner);
    await finishAsWinner(supabase, m1.game_id!, semi1Winner);

    const { data: finalRow } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('round_number', 2)
      .eq('match_number', 0)
      .single();
    expect(finalRow?.game_id).toBeTruthy();
    expect(finalRow?.player1_id).toBe(semi0Winner);
    expect(finalRow?.player2_id).toBe(semi1Winner);

    const champion = p2;
    await finishAsWinner(supabase, finalRow!.game_id!, champion);

    const { data: tDone } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
    expect(tDone?.status).toBe('completed');

    const { data: root } = await supabase
      .from('tournament_matches')
      .select('winner_id, round_number, match_number')
      .eq('tournament_id', tournamentId)
      .is('next_match_id', null)
      .single();
    expect(root?.winner_id).toBe(champion);
    expect(matchKey(root!.round_number, root!.match_number)).toBe('2:0');

    if (!process.env.TOURNAMENT_4P_KEEP) {
      const gameIds = [m0.game_id, m1.game_id, finalRow!.game_id].filter(Boolean);
      await supabase.from('games').delete().in('id', gameIds);
      await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournaments').delete().eq('id', tournamentId);
    }
  });
});
