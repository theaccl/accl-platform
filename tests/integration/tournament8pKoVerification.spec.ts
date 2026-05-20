import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getBracketSizeFromPlans, matchKey, planSingleEliminationBracket, totalRoundsForBracketSize } from '@/lib/tournamentBracket';
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

const ENTRANT_COUNT = 8;

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false } },
  );
}

async function provisionVerificationProfile(
  supabase: SupabaseClient,
  index: number,
): Promise<string> {
  const email = `phase1-8p-it-${Date.now()}-${index}@accl-phase1.invalid`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  expect(error).toBeNull();
  const userId = data!.user.id;

  const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (existing?.id) return String(existing.id);

  const username = `p1v8it_${String(userId).replace(/-/g, '').slice(0, 10)}`;
  const { error: insErr } = await supabase.from('profiles').insert({ id: userId, username });
  expect(insErr).toBeNull();
  return userId;
}

async function resolveEightIds(supabase: SupabaseClient): Promise<string[]> {
  const raw = process.env.PHASE_1_8P_PLAYER_IDS?.trim();
  if (raw) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    expect(ids).toHaveLength(ENTRANT_COUNT);
    return ids;
  }

  const fallback: string[] = [
    process.env.BOT_USER_ID_CARDI?.trim(),
    process.env.BOT_USER_ID_AGGRO?.trim(),
    process.env.BOT_USER_ID_ENDGAME?.trim(),
  ].filter((id): id is string => Boolean(id));
  const { data } = await supabase.from('profiles').select('id').limit(ENTRANT_COUNT + 8);
  for (const row of data ?? []) {
    const id = String(row.id);
    if (!fallback.includes(id)) fallback.push(id);
    if (fallback.length >= ENTRANT_COUNT) break;
  }
  const unique = [...new Set(fallback)];
  while (unique.length < ENTRANT_COUNT) {
    unique.push(await provisionVerificationProfile(supabase, unique.length));
  }
  return unique.slice(0, ENTRANT_COUNT);
}

function pickWinner(match: {
  player1_id: string | null;
  player2_id: string | null;
}): string {
  if (!match.player1_id && !match.player2_id) throw new Error('empty match');
  if (!match.player2_id) return match.player1_id!;
  if (!match.player1_id) return match.player2_id!;
  return match.player1_id;
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

async function reloadMatches(supabase: SupabaseClient, tournamentId: string) {
  const { data, error } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number')
    .order('match_number');
  expect(error).toBeNull();
  return data ?? [];
}

test.describe('Phase 1 — 8-player KO (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('registration → bracket → R1 → R2 → final → champion', async () => {
    const supabase = serviceClient();
    const players = await resolveEightIds(supabase);
    const plans = planSingleEliminationBracket(players);
    expect(getBracketSizeFromPlans(plans)).toBe(8);
    expect(plans.length).toBe(7);
    expect(totalRoundsForBracketSize(8)).toBe(3);

    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();
    expect(creator?.id).toBeTruthy();

    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .insert({
        name: `IT 8P KO ${Date.now()}`,
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
    expect(matchRows).toHaveLength(7);

    let matches = matchRows;
    const r1 = matches.filter((m) => m.round_number === 1);
    expect(r1).toHaveLength(4);
    for (const m of r1) expect(m.game_id).toBeTruthy();

    for (const m of r1) {
      await finishAsWinner(supabase, m.game_id!, pickWinner(m));
    }

    matches = await reloadMatches(supabase, tournamentId);
    const r2 = matches.filter((m) => m.round_number === 2);
    expect(r2).toHaveLength(2);
    for (const m of r2) {
      expect(m.game_id).toBeTruthy();
      expect(m.player1_id).toBeTruthy();
      expect(m.player2_id).toBeTruthy();
    }

    for (const m of r2) {
      await finishAsWinner(supabase, m.game_id!, pickWinner(m));
    }

    matches = await reloadMatches(supabase, tournamentId);
    const final = matches.filter((m) => m.round_number === 3);
    expect(final).toHaveLength(1);
    expect(final[0]!.game_id).toBeTruthy();

    const champion = pickWinner(final[0]!);
    await finishAsWinner(supabase, final[0]!.game_id!, champion);

    const { data: tDone } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
    expect(tDone?.status).toBe('completed');

    const { data: root } = await supabase
      .from('tournament_matches')
      .select('winner_id, round_number, match_number')
      .eq('tournament_id', tournamentId)
      .is('next_match_id', null)
      .single();
    expect(root?.winner_id).toBe(champion);
    expect(matchKey(root!.round_number, root!.match_number)).toBe('3:0');

    if (!process.env.TOURNAMENT_8P_KEEP) {
      const gameIds = matches.map((m) => m.game_id).filter(Boolean);
      await supabase.from('games').delete().in('id', gameIds);
      await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournaments').delete().eq('id', tournamentId);
    }
  });
});
