/**
 * Phase 1 — multi-tournament concurrency (verification only).
 *
 * Proves isolation when two+ tournaments run simultaneously:
 * - games/matches scoped by tournament_id
 * - advancement in A does not mutate B
 * - spectate RPC shows correct tournament_id per board
 * - re-bootstrap on one event does not affect another
 * - completing A leaves B active
 * - free-play activity does not cross-contaminate
 *
 * Usage: node scripts/tournament-multi-concurrency-verification.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Requires 8 profile UUIDs: PHASE_1_MULTI_PLAYER_IDS or >=8 profiles in DB
 * Optional: MULTI_INCLUDE_8P=1 (adds 8-player tournament), TOURNAMENT_MULTI_KEEP=1
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const INCLUDE_8P = process.env.MULTI_INCLUDE_8P === '1';

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

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function nextPowerOf2(n) {
  if (n <= 0) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function planBracket(orderedUserIds) {
  const m = nextPowerOf2(orderedUserIds.length);
  const ext = [...orderedUserIds];
  while (ext.length < m) ext.push(null);
  const half = m / 2;
  const plans = [];
  for (let i = 0; i < half; i++) {
    plans.push({
      roundNumber: 1,
      matchNumber: i,
      player1Id: ext[i],
      player2Id: ext[m - 1 - i],
      advanceWinnerAs: i % 2 === 0 ? 'player1' : 'player2',
    });
  }
  for (let r = 2; r <= Math.round(Math.log2(m)); r++) {
    const count = m / 2 ** r;
    for (let idx = 0; idx < count; idx++) {
      plans.push({
        roundNumber: r,
        matchNumber: idx,
        player1Id: null,
        player2Id: null,
        advanceWinnerAs: idx % 2 === 0 ? 'player1' : 'player2',
      });
    }
  }
  return plans;
}

function matchKey(r, n) {
  return `${r}:${n}`;
}

async function resolveEightPlayers(supabase) {
  const raw =
    process.env.PHASE_1_MULTI_PLAYER_IDS?.trim() || process.env.PHASE_1_4P_PLAYER_IDS?.trim();
  if (raw) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length < 8 || new Set(ids).size < 8) {
      fail('Need 8 distinct UUIDs in PHASE_1_MULTI_PLAYER_IDS (or extend PHASE_1_4P_PLAYER_IDS to 8)');
    }
    return ids.slice(0, 8);
  }
  const fallback = [
    process.env.BOT_USER_ID_CARDI?.trim(),
    process.env.BOT_USER_ID_AGGRO?.trim(),
    process.env.BOT_USER_ID_ENDGAME?.trim(),
  ].filter(Boolean);
  const { data } = await supabase.from('profiles').select('id').limit(16);
  for (const row of data ?? []) {
    const id = String(row.id);
    if (!fallback.includes(id)) fallback.push(id);
    if (fallback.length >= 8) break;
  }
  if (fallback.length < 8) {
    fail('Need 8 profile UUIDs (PHASE_1_MULTI_PLAYER_IDS or >=8 profiles in DB)');
  }
  return fallback.slice(0, 8);
}

async function createTournament(supabase, creatorId, label) {
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name: `P1 multi ${label} ${Date.now()}`,
      status: 'pending',
      format: 'single_elimination',
      tempo: 'live',
      rated: false,
      created_by: creatorId,
      ecosystem_scope: 'adult',
    })
    .select('id')
    .single();
  if (error || !data?.id) fail(`create tournament ${label}: ${error?.message}`);
  return data.id;
}

async function persistBracket(supabase, tournamentId, players) {
  const plans = planBracket(players);
  const totalRounds = Math.round(Math.log2(nextPowerOf2(players.length)));
  const { data: inserted, error: insErr } = await supabase
    .from('tournament_matches')
    .insert(
      plans.map((p) => ({
        tournament_id: tournamentId,
        round_number: p.roundNumber,
        match_number: p.matchNumber,
        player1_id: p.player1Id,
        player2_id: p.player2Id,
        advance_winner_as: p.advanceWinnerAs,
        next_match_id: null,
      })),
    )
    .select('id, round_number, match_number');
  if (insErr) fail(`insert matches: ${insErr.message}`);

  const idMap = new Map();
  for (const r of inserted ?? []) idMap.set(matchKey(r.round_number, r.match_number), r.id);

  for (const r of inserted ?? []) {
    if (r.round_number >= totalRounds) continue;
    const nextId = idMap.get(matchKey(r.round_number + 1, Math.floor(r.match_number / 2)));
    if (nextId) {
      await supabase.from('tournament_matches').update({ next_match_id: nextId }).eq('id', r.id);
    }
  }

  await supabase.from('tournaments').update({ status: 'active' }).eq('id', tournamentId);
  const { error: procErr } = await supabase.rpc('tournament_bootstrap_round', {
    p_tournament_id: tournamentId,
  });
  if (procErr) fail(`tournament_bootstrap_round: ${procErr.message}`);

  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number')
    .order('match_number');
  return { matches: matches ?? [], totalRounds };
}

async function tournamentFingerprint(supabase, tournamentId) {
  const { data: t } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('round_number, match_number, game_id, winner_id')
    .eq('tournament_id', tournamentId)
    .order('round_number')
    .order('match_number');
  return {
    status: t?.status ?? null,
    matches: (matches ?? []).map((m) => ({
      r: m.round_number,
      n: m.match_number,
      gid: m.game_id,
      w: m.winner_id,
    })),
  };
}

async function assertGamesScoped(supabase, tournamentId, gameIds) {
  if (gameIds.length === 0) return;
  const { data: games, error } = await supabase
    .from('games')
    .select('id, tournament_id, play_context')
    .in('id', gameIds);
  if (error) fail(`games scope: ${error.message}`);
  for (const g of games ?? []) {
    if (g.tournament_id !== tournamentId) {
      fail(`game ${g.id} tournament_id ${g.tournament_id} !== ${tournamentId}`);
    }
    if (g.play_context !== 'tournament') fail(`game ${g.id} play_context not tournament`);
  }
}

async function finishAsWinner(supabase, gameId, winnerId) {
  const { data: g } = await supabase
    .from('games')
    .select('white_player_id, black_player_id, status')
    .eq('id', gameId)
    .single();
  if (g?.status === 'finished') return;
  const result =
    g?.white_player_id === winnerId ? 'white_win' : g?.black_player_id === winnerId ? 'black_win' : null;
  if (!result) fail(`winner ${winnerId} not in game ${gameId}`);
  const { error } = await supabase.rpc('finish_game_system', {
    p_game_id: gameId,
    p_result: result,
    p_end_reason: 'timeout',
  });
  if (error) fail(`finish_game_system: ${error.message}`);
}

async function spectateTournamentId(supabase, gameId, expectedTournamentId) {
  const { data, error } = await supabase.rpc('get_public_spectate_game_snapshot', {
    p_game_id: gameId,
    p_viewer_ecosystem: 'adult',
  });
  if (error) fail(`spectate: ${error.message}`);
  const tid = data?.game?.tournament_id;
  if (tid !== expectedTournamentId) {
    fail(`spectate cross-leak: game ${gameId} shows tournament_id ${tid}, expected ${expectedTournamentId}`);
  }
  return data;
}

async function completeFourPlayer(supabase, tournamentId, players, r1Matches) {
  const r1 = r1Matches.filter((m) => m.round_number === 1);
  const w0 = players[0];
  const w1 = players[1];
  await finishAsWinner(supabase, r1[0].game_id, w0);
  await finishAsWinner(supabase, r1[1].game_id, w1);
  const { data: finalMatch } = await supabase
    .from('tournament_matches')
    .select('id, game_id')
    .eq('tournament_id', tournamentId)
    .eq('round_number', 2)
    .maybeSingle();
  if (!finalMatch?.game_id) fail(`complete 4P: final not spawned for ${tournamentId}`);
  await finishAsWinner(supabase, finalMatch.game_id, w1);
}

async function loadFreeBusyCount(supabase, userId) {
  const { data, error } = await supabase
    .from('games')
    .select('id, tournament_id, play_context')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`);
  if (error) fail(`free busy: ${error.message}`);
  return data ?? [];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const eight = await resolveEightPlayers(supabase);
  const playersA = eight.slice(0, 4);
  const playersB = eight.slice(4, 8);
  ok(`players: A=${playersA.map((id) => id.slice(0, 8)).join(',')} | B=${playersB.map((id) => id.slice(0, 8)).join(',')}`);

  const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

  const tA = await createTournament(supabase, creator?.id ?? playersA[0], 'A-4P');
  const tB = await createTournament(supabase, creator?.id ?? playersB[0], 'B-4P');

  await supabase.from('tournament_entries').insert(
    playersA.map((user_id) => ({ tournament_id: tA, user_id })),
  );
  await supabase.from('tournament_entries').insert(
    playersB.map((user_id) => ({ tournament_id: tB, user_id })),
  );

  const bracketA = await persistBracket(supabase, tA, playersA);
  const bracketB = await persistBracket(supabase, tB, playersB);

  const { data: stA } = await supabase.from('tournaments').select('status').eq('id', tA).single();
  const { data: stB } = await supabase.from('tournaments').select('status').eq('id', tB).single();
  if (stA?.status !== 'active' || stB?.status !== 'active') {
    fail(`both tournaments must be active (A=${stA?.status}, B=${stB?.status})`);
  }
  ok('concurrency: two 4P tournaments active simultaneously');

  const r1A = bracketA.matches.filter((m) => m.round_number === 1 && m.game_id);
  const r1B = bracketB.matches.filter((m) => m.round_number === 1 && m.game_id);
  if (r1A.length !== 2 || r1B.length !== 2) fail('expected 2 R1 games per tournament');

  const gameIdsA = r1A.map((m) => m.game_id);
  const gameIdsB = r1B.map((m) => m.game_id);
  await assertGamesScoped(supabase, tA, [...gameIdsA, ...bracketA.matches.map((m) => m.game_id).filter(Boolean)]);
  await assertGamesScoped(supabase, tB, [...gameIdsB, ...bracketB.matches.map((m) => m.game_id).filter(Boolean)]);
  ok('isolation: all spawned games carry correct tournament_id');

  const fpBBefore = await tournamentFingerprint(supabase, tB);
  await finishAsWinner(supabase, r1A[0].game_id, playersA[0]);
  const fpBAfter = await tournamentFingerprint(supabase, tB);
  if (JSON.stringify(fpBBefore) !== JSON.stringify(fpBAfter)) {
    fail('advancement leak: finishing A R1 game mutated B bracket fingerprint');
  }
  const { data: mA0 } = await supabase
    .from('tournament_matches')
    .select('winner_id')
    .eq('id', r1A[0].id)
    .single();
  if (!mA0?.winner_id) fail('A R1 match 0 should have winner after finish');
  ok('advancement: Tournament A R1 progress does not affect Tournament B');

  await spectateTournamentId(supabase, r1A[0].game_id, tA);
  await spectateTournamentId(supabase, r1B[0].game_id, tB);
  await spectateTournamentId(supabase, r1A[1].game_id, tA);
  await spectateTournamentId(supabase, r1B[1].game_id, tB);
  ok('spectator isolation: spectate RPC tournament_id matches each event');

  const bGameIdsBefore = gameIdsB.slice().sort().join(',');
  for (let i = 0; i < 2; i++) {
    await supabase.rpc('tournament_bootstrap_round', { p_tournament_id: tA });
  }
  const { data: r1BReload } = await supabase
    .from('tournament_matches')
    .select('game_id')
    .eq('tournament_id', tB)
    .eq('round_number', 1);
  const bGameIdsAfter = (r1BReload ?? []).map((m) => m.game_id).filter(Boolean).sort().join(',');
  if (bGameIdsBefore !== bGameIdsAfter) fail('re-bootstrap on A changed B R1 game_id links');
  ok('re-bootstrap: Tournament A idempotent re-run does not affect Tournament B');

  await completeFourPlayer(supabase, tA, playersA, bracketA.matches);
  const { data: tADone } = await supabase.from('tournaments').select('status').eq('id', tA).single();
  const { data: tBActive } = await supabase.from('tournaments').select('status').eq('id', tB).single();
  if (tADone?.status !== 'completed') fail(`A should be completed (got ${tADone?.status})`);
  if (tBActive?.status !== 'active') fail(`B should stay active (got ${tBActive?.status})`);
  ok('completion isolation: A completed while B remains active');

  const fpBAfterAComplete = await tournamentFingerprint(supabase, tB);
  if (JSON.stringify(fpBBefore) !== JSON.stringify(fpBAfterAComplete)) {
    fail('completing A mutated B bracket (unexpected cross-contamination)');
  }
  ok('snapshot coherence: B fingerprint unchanged after A full completion');

  const busyBefore = await loadFreeBusyCount(supabase, playersA[0]);
  const { data: freeGame, error: fErr } = await supabase
    .from('games')
    .insert({
      white_player_id: playersA[0],
      black_player_id: playersB[0],
      status: 'active',
      fen: START_FEN,
      turn: 'white',
      play_context: 'free',
      tournament_id: null,
      tempo: 'live',
      live_time_control: '3+2',
      rated: false,
      source_type: 'challenge',
    })
    .select('id')
    .single();
  if (fErr || !freeGame?.id) fail(`free game: ${fErr?.message}`);

  const busyAfter = await loadFreeBusyCount(supabase, playersA[0]);
  const tournamentBusy = await supabase
    .from('games')
    .select('id')
    .eq('play_context', 'tournament')
    .eq('tournament_id', tB)
    .in('status', ['active', 'waiting']);
  if ((tournamentBusy.data ?? []).length < 1) fail('B should still have active tournament games');

  const fpBAfterFree = await tournamentFingerprint(supabase, tB);
  if (JSON.stringify(fpBBefore) !== JSON.stringify(fpBAfterFree)) {
    fail('free-play during multi-tournament mutated B bracket');
  }
  ok('free-play coexistence: free activity does not mutate tournament brackets');

  const tournamentIds = [tA, tB];
  const allGameIds = new Set([...gameIdsA, ...gameIdsB]);
  let t8 = null;
  let bracket8 = null;

  if (INCLUDE_8P) {
    t8 = await createTournament(supabase, creator?.id ?? eight[0], 'C-8P');
    await supabase.from('tournament_entries').insert(
      eight.map((user_id) => ({ tournament_id: t8, user_id })),
    );
    bracket8 = await persistBracket(supabase, t8, eight);
    const r1_8 = bracket8.matches.filter((m) => m.round_number === 1 && m.game_id);
    if (r1_8.length !== 4) fail(`8P R1 expected 4 games, got ${r1_8.length}`);
    await assertGamesScoped(
      supabase,
      t8,
      bracket8.matches.map((m) => m.game_id).filter(Boolean),
    );
    await finishAsWinner(supabase, r1_8[0].game_id, eight[0]);
    const fpBAfter8 = await tournamentFingerprint(supabase, tB);
    if (JSON.stringify(fpBBefore) !== JSON.stringify(fpBAfter8)) {
      fail('8P advancement leaked into 4P tournament B');
    }
    tournamentIds.push(t8);
    for (const m of bracket8.matches) if (m.game_id) allGameIds.add(m.game_id);
    ok('optional 4P+8P: 8P partial advance isolated from concurrent 4P events');
  }

  const report = {
    distributed_recovery: false,
    tournamentA: tA,
    tournamentB: tB,
    tournament8p: t8,
    freeGameId: freeGame.id,
    busyCountBefore: busyBefore.length,
    busyCountAfter: busyAfter.length,
  };

  if (!process.env.TOURNAMENT_MULTI_KEEP) {
    allGameIds.add(freeGame.id);
    await supabase.from('games').delete().in('id', [...allGameIds]);
    for (const tid of tournamentIds) {
      await supabase.from('tournament_matches').delete().eq('tournament_id', tid);
      await supabase.from('tournament_entries').delete().eq('tournament_id', tid);
      await supabase.from('tournaments').delete().eq('id', tid);
    }
    ok('cleanup');
  }

  console.log('\nPhase 1 — multi-tournament concurrency verification PASSED');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
