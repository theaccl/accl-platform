import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { buildTournamentSnapshot } from '@/lib/server/tournamentSnapshotReadModel';
import { persistTournamentBracket, applyTournamentEntrySeeds } from '@/lib/tournamentPersist';
import { championUserIdFromTournament } from '@/lib/tournamentReadModel';

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

test.describe('Phase 1 — tournament standings + champion (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('buildTournamentSnapshot reflects pending → active → completed champion', async () => {
    const supabase = serviceClient();
    const { data: profiles } = await supabase.from('profiles').select('id').limit(4);
    expect((profiles ?? []).length).toBeGreaterThanOrEqual(4);
    const ids = (profiles ?? []).map((r) => String(r.id));

    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

    const { data: tournament } = await supabase
      .from('tournaments')
      .insert({
        name: `IT standings ${Date.now()}`,
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
      ids.map((user_id) => ({ tournament_id: tournamentId, user_id })),
    );
    await applyTournamentEntrySeeds(
      supabase,
      tournamentId,
      ids.map((userId, i) => ({ userId, seed: i + 1, ratingUsed: 1500, createdAtMs: i })),
    );

    const viewer = {
      authenticated: true,
      userId: creator!.id as string,
      viewerEcosystem: 'adult' as const,
    };

    const pending = await buildTournamentSnapshot({ tournamentId, viewer });
    expect(pending.access).toBe('allowed');
    if (pending.access !== 'allowed') return;
    expect(pending.tournament.status).toBe('pending');
    expect(pending.entries).toHaveLength(4);
    expect(pending.matches).toHaveLength(0);

    await persistTournamentBracket(supabase, tournamentId, ids);
    const active = await buildTournamentSnapshot({ tournamentId, viewer });
    expect(active.access).toBe('allowed');
    if (active.access !== 'allowed') return;
    expect(active.tournament.status).toBe('active');
    expect(active.matches.length).toBe(3);
    expect(active.matches.filter((m) => m.round === 1).every((m) => m.gameId)).toBe(true);

    const active2 = await buildTournamentSnapshot({ tournamentId, viewer });
    expect(active2.access).toBe('allowed');
    if (active2.access !== 'allowed') return;
    expect(JSON.stringify(active.matches)).toBe(JSON.stringify(active2.matches));

    const r1 = active.matches.filter((m) => m.round === 1);
    const finish = async (gameId: string, winnerId: string) => {
      const { data: g } = await supabase
        .from('games')
        .select('white_player_id, black_player_id')
        .eq('id', gameId)
        .single();
      await supabase.rpc('finish_game_system', {
        p_game_id: gameId,
        p_result: g!.white_player_id === winnerId ? 'white_win' : 'black_win',
        p_end_reason: 'timeout',
      });
    };

    await finish(r1[0].gameId!, r1[0].player1.userId!);
    const partial = await buildTournamentSnapshot({ tournamentId, viewer });
    if (partial.access !== 'allowed') return;
    const partialR1 = partial.matches.filter((m) => m.round === 1);
    expect(partialR1.some((m) => m.boardStatus === 'resolved')).toBe(true);
    expect(partialR1.some((m) => m.boardStatus === 'live')).toBe(true);
    expect(partial.matches.find((m) => m.round === 2)?.gameId).toBeFalsy();

    await finish(r1[1].gameId!, r1[1].player1.userId!);
    const preFinal = await buildTournamentSnapshot({ tournamentId, viewer });
    if (preFinal.access !== 'allowed') return;
    const finalM = preFinal.matches.find((m) => m.round === 2)!;
    expect(finalM.gameId).toBeTruthy();

    const championId = finalM.player2.userId!;
    await finish(finalM.gameId!, championId);

    const done = await buildTournamentSnapshot({ tournamentId, viewer });
    if (done.access !== 'allowed') return;
    expect(done.tournament.status).toBe('completed');

    const matchRows = done.matches.map((m) => ({
      round_number: m.round,
      winner_id: m.winnerUserId,
      next_match_id: m.nextMatchId,
    }));
    expect(championUserIdFromTournament('completed', matchRows)).toBe(championId);
    expect(done.matches.find((m) => m.round === 2)?.winnerUserId).toBe(championId);

    const gameIds = done.matches.map((m) => m.gameId).filter(Boolean) as string[];
    await supabase.from('games').delete().in('id', gameIds);
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
    await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
    await supabase.from('tournaments').delete().eq('id', tournamentId);
  });
});
