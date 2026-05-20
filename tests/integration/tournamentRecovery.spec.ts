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

test.describe('Phase 1 — tournament recovery (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('partial R1, re-bootstrap, snapshot coherence, then completion', async () => {
    const supabase = serviceClient();
    const { data: profiles } = await supabase.from('profiles').select('id').limit(4);
    expect((profiles ?? []).length).toBeGreaterThanOrEqual(4);
    const [p1, p2, p3, p4] = (profiles ?? []).map((r) => String(r.id));

    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

    const { data: tournament } = await supabase
      .from('tournaments')
      .insert({
        name: `IT recovery ${Date.now()}`,
        status: 'pending',
        format: 'single_elimination',
        tempo: 'live',
        rated: false,
        created_by: creator!.id,
        ecosystem_scope: 'adult',
      })
      .select('id')
      .single();

    await supabase.from('tournament_entries').insert(
      [p1, p2, p3, p4].map((user_id) => ({ tournament_id: tournament!.id, user_id })),
    );

    const { matchRows } = await persistTournamentBracket(supabase, tournament!.id as string, [
      p1,
      p2,
      p3,
      p4,
    ]);
    const r1 = matchRows.filter((m) => m.round_number === 1);
    const r1m0 = r1.find((m) => m.match_number === 0)!;
    const r1m1 = r1.find((m) => m.match_number === 1)!;

    const finishWinner = async (gameId: string, winnerId: string) => {
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

    await finishWinner(r1m0.game_id!, p1);

    const snapPartial = await buildTournamentSnapshot({
      tournamentId: tournament!.id as string,
      viewer: { authenticated: true, userId: p1, viewerEcosystem: 'adult' },
    });
    expect(snapPartial.access).toBe('allowed');
    if (snapPartial.access !== 'allowed') return;

    const r1Boards = snapPartial.matches.filter((m) => m.round === 1);
    expect(r1Boards.some((m) => m.boardStatus === 'resolved')).toBe(true);
    expect(r1Boards.some((m) => m.boardStatus === 'live')).toBe(true);

    const idsBefore = [r1m0.game_id, r1m1.game_id].sort().join(',');
    await supabase.rpc('tournament_bootstrap_round', { p_tournament_id: tournament!.id });
    const { data: r1Reload } = await supabase
      .from('tournament_matches')
      .select('game_id')
      .eq('tournament_id', tournament!.id)
      .eq('round_number', 1);
    const idsAfter = (r1Reload ?? []).map((m) => m.game_id).filter(Boolean).sort().join(',');
    expect(idsAfter).toBe(idsBefore);

    await finishWinner(r1m1.game_id!, p2);

    const snapMid = await buildTournamentSnapshot({
      tournamentId: tournament!.id as string,
      viewer: { authenticated: true, userId: p1, viewerEcosystem: 'adult' },
    });
    expect(snapMid.access).toBe('allowed');
    if (snapMid.access !== 'allowed') return;

    const finalRow = snapMid.matches.find((m) => m.round === 2);
    expect(finalRow?.gameId).toBeTruthy();

    await finishWinner(finalRow!.gameId!, p2);

    const snapDone = await buildTournamentSnapshot({
      tournamentId: tournament!.id as string,
      viewer: { authenticated: true, userId: p1, viewerEcosystem: 'adult' },
    });
    expect(snapDone.access).toBe('allowed');
    if (snapDone.access !== 'allowed') return;
    expect(snapDone.tournament.status).toBe('completed');

    const gameIds = [
      r1m0.game_id!,
      r1m1.game_id!,
      finalRow!.gameId!,
    ];
    await supabase.from('games').delete().in('id', gameIds);
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournament!.id);
    await supabase.from('tournament_entries').delete().eq('tournament_id', tournament!.id);
    await supabase.from('tournaments').delete().eq('id', tournament!.id);
  });
});
