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

async function createTournament(supabase: SupabaseClient, creatorId: string, label: string) {
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name: `IT no-show ${label} ${Date.now()}`,
      status: 'pending',
      format: 'single_elimination',
      tempo: 'live',
      rated: false,
      created_by: creatorId,
      ecosystem_scope: 'adult',
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

async function cleanup(
  supabase: SupabaseClient,
  tournamentId: string,
  gameIds: (string | null | undefined)[],
) {
  const ids = [...new Set(gameIds.filter(Boolean))] as string[];
  if (ids.length) await supabase.from('games').delete().in('id', ids);
  await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
  await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
  await supabase.from('tournaments').delete().eq('id', tournamentId);
}

function winResultForPlayer(
  whiteId: string | null,
  blackId: string | null,
  winnerId: string,
): 'white_win' | 'black_win' {
  if (whiteId === winnerId) return 'white_win';
  return 'black_win';
}

test.describe('Phase 1 — tournament no-show ops (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('draw does not advance bracket', async () => {
    const supabase = serviceClient();
    const players = await resolveFourIds(supabase);
    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();
    const tournamentId = await createTournament(supabase, creator!.id, 'draw');

    await supabase.from('tournament_entries').insert(
      players.map((user_id) => ({ tournament_id: tournamentId, user_id })),
    );
    const { matchRows } = await persistTournamentBracket(supabase, tournamentId, players);
    const r1m0 = matchRows.find((m) => m.round_number === 1 && m.match_number === 0)!;

    const { error } = await supabase.rpc('finish_game_system', {
      p_game_id: r1m0.game_id!,
      p_result: 'draw',
      p_end_reason: 'draw_agreement',
    });
    expect(error).toBeNull();

    const { data: m0 } = await supabase
      .from('tournament_matches')
      .select('winner_id')
      .eq('id', r1m0.id)
      .single();
    expect(m0?.winner_id).toBeNull();

    const { data: t } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
    expect(t?.status).not.toBe('completed');

    if (!process.env.TOURNAMENT_NOSHOW_KEEP) {
      await cleanup(supabase, tournamentId, [r1m0.game_id]);
    }
  });

  test('operator forfeit path completes tournament', async () => {
    const supabase = serviceClient();
    const players = await resolveFourIds(supabase);
    const [p1, p2] = players;
    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();
    const tournamentId = await createTournament(supabase, creator!.id, 'forfeit');

    await supabase.from('tournament_entries').insert(
      players.map((user_id) => ({ tournament_id: tournamentId, user_id })),
    );
    const { matchRows } = await persistTournamentBracket(supabase, tournamentId, players);
    const r1m0 = matchRows.find((m) => m.round_number === 1 && m.match_number === 0)!;
    const r1m1 = matchRows.find((m) => m.round_number === 1 && m.match_number === 1)!;

    const { data: g0 } = await supabase
      .from('games')
      .select('white_player_id, black_player_id')
      .eq('id', r1m0.game_id!)
      .single();
    await supabase.rpc('finish_game_system', {
      p_game_id: r1m0.game_id!,
      p_result: winResultForPlayer(g0!.white_player_id, g0!.black_player_id, p1),
      p_end_reason: 'resign',
    });

    const { data: g1 } = await supabase
      .from('games')
      .select('white_player_id, black_player_id')
      .eq('id', r1m1.game_id!)
      .single();
    await supabase.rpc('finish_game_system', {
      p_game_id: r1m1.game_id!,
      p_result: winResultForPlayer(g1!.white_player_id, g1!.black_player_id, p2),
      p_end_reason: 'timeout',
    });

    const { data: final } = await supabase
      .from('tournament_matches')
      .select('id, game_id, player1_id, player2_id, winner_id')
      .eq('tournament_id', tournamentId)
      .eq('round_number', 2)
      .single();
    expect(final?.game_id).toBeTruthy();
    expect(final?.player1_id).toBe(p1);
    expect(final?.player2_id).toBe(p2);

    const { data: gf } = await supabase
      .from('games')
      .select('white_player_id, black_player_id')
      .eq('id', final!.game_id!)
      .single();
    await supabase.rpc('finish_game_system', {
      p_game_id: final!.game_id!,
      p_result: winResultForPlayer(gf!.white_player_id, gf!.black_player_id, p1),
      p_end_reason: 'resign',
    });

    const { data: tDone } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
    expect(tDone?.status).toBe('completed');

    const { data: finalDone } = await supabase
      .from('tournament_matches')
      .select('winner_id')
      .eq('id', final!.id)
      .single();
    expect(finalDone?.winner_id).toBe(p1);

    if (!process.env.TOURNAMENT_NOSHOW_KEEP) {
      await cleanup(supabase, tournamentId, [r1m0.game_id, r1m1.game_id, final!.game_id]);
    }
  });
});
