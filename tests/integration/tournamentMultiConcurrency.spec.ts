import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { buildTournamentSnapshot } from '@/lib/server/tournamentSnapshotReadModel';
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

test.describe('Phase 1 — multi-tournament concurrency (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  test.skip(
    (process.env.CI ?? '').toLowerCase() === 'true' && !process.env.PHASE_1_MULTI_PLAYER_IDS,
    'CI needs PHASE_1_MULTI_PLAYER_IDS with 8 UUIDs',
  );

  test('two 4P tournaments: advancement in A does not change B snapshot', async () => {
    const supabase = serviceClient();
    const { data: profiles } = await supabase.from('profiles').select('id').limit(8);
    expect((profiles ?? []).length).toBeGreaterThanOrEqual(8);
    const ids = (profiles ?? []).map((r) => String(r.id));
    const playersA = ids.slice(0, 4);
    const playersB = ids.slice(4, 8);

    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

    const mkTournament = async (label: string) => {
      const { data } = await supabase
        .from('tournaments')
        .insert({
          name: `IT multi ${label} ${Date.now()}`,
          status: 'pending',
          format: 'single_elimination',
          tempo: 'live',
          rated: false,
          created_by: creator!.id,
          ecosystem_scope: 'adult',
        })
        .select('id')
        .single();
      return data!.id as string;
    };

    const tA = await mkTournament('A');
    const tB = await mkTournament('B');

    await supabase.from('tournament_entries').insert(
      playersA.map((user_id) => ({ tournament_id: tA, user_id })),
    );
    await supabase.from('tournament_entries').insert(
      playersB.map((user_id) => ({ tournament_id: tB, user_id })),
    );

    const { matchRows: matchesA } = await persistTournamentBracket(supabase, tA, playersA);
    const { matchRows: matchesB } = await persistTournamentBracket(supabase, tB, playersB);

    const snapBBefore = await buildTournamentSnapshot({
      tournamentId: tB,
      viewer: { authenticated: true, userId: playersB[0], viewerEcosystem: 'adult' },
    });
    expect(snapBBefore.access).toBe('allowed');
    if (snapBBefore.access !== 'allowed') return;
    const winnersBefore = snapBBefore.matches.filter((m) => m.winnerUserId).length;

    const r1A = matchesA.find((m) => m.round_number === 1 && m.match_number === 0)!;
    const { data: g } = await supabase
      .from('games')
      .select('white_player_id, black_player_id')
      .eq('id', r1A.game_id!)
      .single();
    const winner = g!.white_player_id === playersA[0] ? playersA[0] : playersA[1];
    await supabase.rpc('finish_game_system', {
      p_game_id: r1A.game_id!,
      p_result: g!.white_player_id === winner ? 'white_win' : 'black_win',
      p_end_reason: 'timeout',
    });

    const snapBAfter = await buildTournamentSnapshot({
      tournamentId: tB,
      viewer: { authenticated: true, userId: playersB[0], viewerEcosystem: 'adult' },
    });
    expect(snapBAfter.access).toBe('allowed');
    if (snapBAfter.access !== 'allowed') return;
    const winnersAfter = snapBAfter.matches.filter((m) => m.winnerUserId).length;
    expect(winnersAfter).toBe(winnersBefore);

    const { data: spectate } = await supabase.rpc('get_public_spectate_game_snapshot', {
      p_game_id: r1A.game_id!,
      p_viewer_ecosystem: 'adult',
    });
    expect(spectate?.game?.tournament_id).toBe(tA);

    const gameIds = [
      ...matchesA.map((m) => m.game_id).filter(Boolean),
      ...matchesB.map((m) => m.game_id).filter(Boolean),
    ] as string[];

    await supabase.from('games').delete().in('id', gameIds);
    await supabase.from('tournament_matches').delete().in('tournament_id', [tA, tB]);
    await supabase.from('tournament_entries').delete().in('tournament_id', [tA, tB]);
    await supabase.from('tournaments').delete().in('id', [tA, tB]);
  });
});
