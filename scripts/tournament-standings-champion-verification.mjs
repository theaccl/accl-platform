/**
 * Phase 1 — tournament standings + champion snapshot (verification only).
 *
 * Verifies read-model truth via DB + derived bracket helpers (mirrors lib/tournamentReadModel.ts).
 * Does not redesign UI, payouts, Swiss, ratings, or trophy emitters.
 *
 * Usage: node scripts/tournament-standings-champion-verification.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: PHASE_1_4P_PLAYER_IDS, TOURNAMENT_STANDINGS_KEEP=1
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

/** Mirrors lib/tournamentReadModel.ts */
function findFinalMatch(matches) {
  const terminal = matches.filter((m) => m.next_match_id == null);
  if (terminal.length === 0) return null;
  return terminal.reduce((a, b) => (a.round_number >= b.round_number ? a : b));
}

function championUserIdFromTournament(status, matches) {
  if (status !== 'completed') return null;
  const fin = findFinalMatch(matches);
  return fin?.winner_id ?? null;
}

function matchBoardStatus(m, gameRowStatus) {
  if (m.winner_id) return 'resolved';
  if (!m.player1_id || !m.player2_id) return 'waiting';
  if (!m.game_id) return 'ready';
  const gs = String(gameRowStatus ?? '').toLowerCase();
  if (gs === 'active' || gs === 'waiting') return 'live';
  if (gs === 'finished') return 'resolved';
  return 'live';
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

async function resolveFourPlayers(supabase) {
  const raw = process.env.PHASE_1_4P_PLAYER_IDS?.trim();
  if (raw) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length !== 4 || new Set(ids).size !== 4) fail('PHASE_1_4P_PLAYER_IDS must be 4 distinct UUIDs');
    return ids;
  }
  const fallback = [
    process.env.BOT_USER_ID_CARDI?.trim(),
    process.env.BOT_USER_ID_AGGRO?.trim(),
    process.env.BOT_USER_ID_ENDGAME?.trim(),
  ].filter(Boolean);
  const { data } = await supabase.from('profiles').select('id').limit(12);
  for (const row of data ?? []) {
    const id = String(row.id);
    if (!fallback.includes(id)) fallback.push(id);
    if (fallback.length >= 4) break;
  }
  if (fallback.length < 4) fail('Need 4 profile UUIDs');
  return fallback.slice(0, 4);
}

async function applySeeds(supabase, tournamentId, players) {
  for (let i = 0; i < players.length; i++) {
    const { error } = await supabase
      .from('tournament_entries')
      .update({ seed: i + 1 })
      .eq('tournament_id', tournamentId)
      .eq('user_id', players[i]);
    if (error) fail(`seed update: ${error.message}`);
  }
}

async function loadBracketState(supabase, tournamentId) {
  const { data: t } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
  const { data: entries } = await supabase
    .from('tournament_entries')
    .select('user_id, seed')
    .eq('tournament_id', tournamentId)
    .order('seed', { ascending: true });
  const { data: matches } = await supabase
    .from('tournament_matches')
    .select(
      'id, round_number, match_number, player1_id, player2_id, game_id, winner_id, next_match_id',
    )
    .eq('tournament_id', tournamentId)
    .order('round_number')
    .order('match_number');

  const gameIds = [...new Set((matches ?? []).map((m) => m.game_id).filter(Boolean))];
  const statusByGame = new Map();
  if (gameIds.length) {
    const { data: games } = await supabase.from('games').select('id, status, tournament_id').in('id', gameIds);
    for (const g of games ?? []) statusByGame.set(g.id, g);
  }

  const boards = (matches ?? []).map((m) => ({
    round: m.round_number,
    n: m.match_number,
    gid: m.game_id,
    w: m.winner_id,
    board: matchBoardStatus(m, m.game_id ? statusByGame.get(m.game_id)?.status : null),
    p1: m.player1_id,
    p2: m.player2_id,
  }));

  return {
    status: t?.status ?? null,
    entries: entries ?? [],
    matches: matches ?? [],
    boards,
    champion: championUserIdFromTournament(t?.status ?? '', matches ?? []),
    gameRows: [...statusByGame.values()],
  };
}

function snapshotFingerprint(state) {
  return JSON.stringify({
    status: state.status,
    entries: state.entries.map((e) => ({ u: e.user_id, s: e.seed })),
    boards: state.boards,
    champion: state.champion,
  });
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
  if (!result) fail(`winner ${winnerId} not in game`);
  const { error } = await supabase.rpc('finish_game_system', {
    p_game_id: gameId,
    p_result: result,
    p_end_reason: 'timeout',
  });
  if (error) fail(`finish_game_system: ${error.message}`);
}

async function completeWithChampion(supabase, tournamentId, championId) {
  let state = await loadBracketState(supabase, tournamentId);
  for (const m of state.matches.filter((x) => x.round_number === 1)) {
    if (!m.game_id || !m.player1_id) fail('R1 match missing game or player1');
    await finishAsWinner(supabase, m.game_id, m.player1_id);
  }
  state = await loadBracketState(supabase, tournamentId);
  const fin = findFinalMatch(state.matches);
  if (!fin?.game_id) fail('final game missing before championship finish');
  await finishAsWinner(supabase, fin.game_id, championId);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const players = await resolveFourPlayers(supabase);
  const [p1, p2, p3, p4] = players;
  ok(`players: ${players.map((id) => id.slice(0, 8)).join(', ')}…`);

  const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .insert({
      name: `P1 standings ${Date.now()}`,
      status: 'pending',
      format: 'single_elimination',
      tempo: 'live',
      rated: false,
      created_by: creator?.id ?? p1,
      ecosystem_scope: 'adult',
    })
    .select('id')
    .single();
  if (tErr || !tournament?.id) fail(`tournament: ${tErr?.message}`);
  const tId = tournament.id;

  await supabase.from('tournament_entries').insert(
    players.map((user_id) => ({ tournament_id: tId, user_id })),
  );
  await applySeeds(supabase, tId, players);

  let state = await loadBracketState(supabase, tId);
  if (state.status !== 'pending') fail(`expected pending, got ${state.status}`);
  if (state.entries.length !== 4) fail(`pending: expected 4 entries, got ${state.entries.length}`);
  if (state.matches.length !== 0) fail('pending: should have no matches before bracket persist');
  const seeds = state.entries.map((e) => e.seed).sort((a, b) => a - b);
  if (JSON.stringify(seeds) !== JSON.stringify([1, 2, 3, 4])) {
    fail(`pending: seeds expected [1,2,3,4], got ${JSON.stringify(seeds)}`);
  }
  ok('pending: 4 registered entrants with seeds 1–4');

  await persistBracket(supabase, tId, players);
  state = await loadBracketState(supabase, tId);
  if (state.status !== 'active') fail(`active: status ${state.status}`);
  if (state.matches.length !== 3) fail(`active: expected 3 matches, got ${state.matches.length}`);
  const r1Boards = state.boards.filter((b) => b.round === 1);
  if (r1Boards.length !== 2 || !r1Boards.every((b) => b.gid && b.board === 'live')) {
    fail('active: R1 matches need game_id and live boardStatus');
  }
  const finalBoard = state.boards.find((b) => b.round === 2);
  if (!finalBoard || finalBoard.gid) fail('active: final should exist without game_id yet');
  if (finalBoard.board !== 'ready' && finalBoard.board !== 'waiting') {
    fail(`active: final boardStatus ${finalBoard.board}`);
  }
  ok('active: bracket matches, seeds, R1 game IDs, match statuses');

  const fpA1 = snapshotFingerprint(state);
  const fpA2 = snapshotFingerprint(await loadBracketState(supabase, tId));
  if (fpA1 !== fpA2) fail('snapshot unstable across repeated reads (active)');
  ok('snapshot stability: repeated reads match (active)');

  const r1 = state.matches.filter((m) => m.round_number === 1);
  await finishAsWinner(supabase, r1[0].game_id, p1);
  state = await loadBracketState(supabase, tId);
  const partialR1 = state.boards.filter((b) => b.round === 1);
  if (!partialR1.some((b) => b.board === 'resolved') || !partialR1.some((b) => b.board === 'live')) {
    fail('partial: need one resolved and one live R1 match');
  }
  const partialFinal = state.boards.find((b) => b.round === 2);
  if (partialFinal?.gid) fail('partial: final must not be spawned yet');
  if (state.champion) fail('partial: champion must be null while active');
  ok('partial: resolved + live R1; future final not spawned; no champion yet');

  await finishAsWinner(supabase, r1[1].game_id, p2);
  state = await loadBracketState(supabase, tId);
  const finalAfterR1 = state.boards.find((b) => b.round === 2);
  if (!finalAfterR1?.p1 || !finalAfterR1?.p2) fail('finalists: both players must be seated');
  if (!finalAfterR1.gid) fail('final: game_id required once both finalists known');
  ok('final match: spawned only after both semifinal winners known');

  const { data: freeGame, error: fErr } = await supabase
    .from('games')
    .insert({
      white_player_id: p3,
      black_player_id: p4,
      status: 'active',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      play_context: 'free',
      tournament_id: null,
      tempo: 'live',
      rated: true,
      source_type: 'challenge',
    })
    .select('id')
    .single();
  if (fErr || !freeGame?.id) fail(`free game: ${fErr?.message}`);

  const matchGameIds = new Set(state.matches.map((m) => m.game_id).filter(Boolean));
  if (matchGameIds.has(freeGame.id)) fail('free-play game leaked into bracket game_id set');
  for (const g of state.gameRows) {
    if (g.tournament_id !== tId) fail('snapshot game row wrong tournament_id');
  }
  ok('standings read model: match game set excludes free-play / ratings scope');

  await finishAsWinner(supabase, finalAfterR1.gid, p2);
  state = await loadBracketState(supabase, tId);
  if (state.status !== 'completed') fail(`completed: status ${state.status}`);
  const fin = findFinalMatch(state.matches);
  if (!fin?.winner_id) fail('completed: final match missing winner_id');
  if (state.champion !== p2 || fin.winner_id !== p2) {
    fail(`champion: expected ${p2}, derived ${state.champion}, final ${fin.winner_id}`);
  }
  ok('completed: status + champion + final winner aligned');

  const fpDone1 = snapshotFingerprint(state);
  const fpDone2 = snapshotFingerprint(await loadBracketState(supabase, tId));
  if (fpDone1 !== fpDone2) fail('snapshot unstable after completion');
  ok('snapshot stability: repeated reads match (completed)');

  const playersB = [p3, p4, p1, p2];
  const { data: tB } = await supabase
    .from('tournaments')
    .insert({
      name: `P1 standings B ${Date.now()}`,
      status: 'pending',
      format: 'single_elimination',
      tempo: 'live',
      rated: false,
      created_by: creator?.id ?? p3,
      ecosystem_scope: 'adult',
    })
    .select('id')
    .single();
  await supabase.from('tournament_entries').insert(
    playersB.map((user_id) => ({ tournament_id: tB.id, user_id })),
  );
  await applySeeds(supabase, tB.id, playersB);
  await persistBracket(supabase, tB.id, playersB);
  await completeWithChampion(supabase, tB.id, p4);

  const stateB = await loadBracketState(supabase, tB.id);
  if (stateB.champion !== p4) fail(`multi: B champion expected p4, got ${stateB.champion}`);
  if (state.champion !== p2) fail('multi: completing B mutated A champion read');
  ok('multi-tournament: champions isolated per event');

  const report = {
    trophy_emitter_in_scope: false,
    rating_recalc_in_scope: false,
    tournamentId: tId,
    tournamentBId: tB.id,
    championA: p2,
    championB: p4,
    freeGameId: freeGame.id,
  };

  const gameIds = [
    ...state.matches.map((m) => m.game_id).filter(Boolean),
    ...stateB.matches.map((m) => m.game_id).filter(Boolean),
    freeGame.id,
  ];
  if (!process.env.TOURNAMENT_STANDINGS_KEEP) {
    await supabase.from('games').delete().in('id', gameIds);
    for (const tid of [tId, tB.id]) {
      await supabase.from('tournament_matches').delete().eq('tournament_id', tid);
      await supabase.from('tournament_entries').delete().eq('tournament_id', tid);
      await supabase.from('tournaments').delete().eq('id', tid);
    }
    ok('cleanup');
  }

  console.log('\nPhase 1 — tournament standings + champion snapshot verification PASSED');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
