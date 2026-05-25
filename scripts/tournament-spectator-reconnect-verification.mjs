/**
 * Phase 1 — tournament spectator + reconnect churn (verification only).
 *
 * Stress-tests DB + RPC boundaries for:
 * - player reload reads (FEN, turn, clocks, status)
 * - live move + spectate snapshot consistency
 * - spectator churn (repeated public spectate RPC)
 * - move log ordering
 * - finish transition + post-finish spectate
 *
 * Does NOT redesign realtime, add spectator features, or change authority rules.
 *
 * Usage: node scripts/tournament-spectator-reconnect-verification.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: NEXT_PUBLIC_SUPABASE_ANON_KEY, PHASE_1_SPECTATOR_PLAYER_IDS=p1,p2
 * Optional: TOURNAMENT_SPECTATOR_KEEP=1
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const SPECTATOR_CHURN_COUNT = Number(process.env.SPECTATOR_CHURN_COUNT ?? 5);

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

async function resolveTwoPlayers(supabase) {
  const raw = process.env.PHASE_1_SPECTATOR_PLAYER_IDS?.trim();
  if (raw) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length < 2 || new Set(ids).size < 2) fail('PHASE_1_SPECTATOR_PLAYER_IDS needs 2 distinct UUIDs');
    return ids.slice(0, 2);
  }
  const fallback = [
    process.env.BOT_USER_ID_CARDI?.trim(),
    process.env.BOT_USER_ID_AGGRO?.trim(),
  ].filter(Boolean);
  const { data } = await supabase.from('profiles').select('id').limit(8);
  for (const row of data ?? []) {
    const id = String(row.id);
    if (!fallback.includes(id)) fallback.push(id);
    if (fallback.length >= 2) break;
  }
  if (fallback.length < 2) fail('Need 2 profile UUIDs (PHASE_1_SPECTATOR_PLAYER_IDS or profiles/BOT_USER_ID_*)');
  return fallback.slice(0, 2);
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
    .select('id, round_number, game_id, player1_id, player2_id')
    .eq('tournament_id', tournamentId);
  return matches ?? [];
}

async function fetchSpectate(supabase, gameId) {
  const { data, error } = await supabase.rpc('get_public_spectate_game_snapshot', {
    p_game_id: gameId,
    p_viewer_ecosystem: 'adult',
  });
  if (error) fail(`get_public_spectate_game_snapshot: ${error.message}`);
  return data;
}

function assertMoveLogsOrdered(logs) {
  if (!Array.isArray(logs)) fail('move_logs not array in spectate payload');
  let prev = 0;
  let prevFen = START_FEN;
  for (const row of logs) {
    const t = new Date(row.created_at).getTime();
    if (Number.isFinite(prev) && t < prev) fail('move_logs not ordered by created_at');
    prev = t;
    if (row.fen_before !== prevFen) {
      fail(`move log fen_before mismatch (expected ${prevFen}, got ${row.fen_before})`);
    }
    prevFen = row.fen_after;
  }
}

async function applyE4(supabase, gameId, whiteId) {
  const { error } = await supabase.rpc('apply_move_and_maybe_finish_system', {
    p_game_id: gameId,
    p_expected_fen: START_FEN,
    p_next_fen: AFTER_E4_FEN,
    p_next_turn: 'black',
    p_last_move_at: new Date().toISOString(),
    p_move_deadline_at: null,
    p_white_clock_ms: 180000,
    p_black_clock_ms: 180000,
    p_promote_waiting_to_active: false,
    p_result: null,
    p_end_reason: null,
    p_move_log: {
      game_id: gameId,
      player_id: whiteId,
      san: 'e4',
      from_sq: 'e2',
      to_sq: 'e4',
      fen_before: START_FEN,
      fen_after: AFTER_E4_FEN,
      move_duration_ms: 40,
    },
  });
  if (error) fail(`apply_move_and_maybe_finish_system: ${error.message}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const [p1, p2] = await resolveTwoPlayers(supabase);
  ok(`players: ${p1.slice(0, 8)}… vs ${p2.slice(0, 8)}…`);

  const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .insert({
      name: `P1 spectate-reconnect ${Date.now()}`,
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

  await supabase.from('tournament_entries').insert([
    { tournament_id: tournament.id, user_id: p1 },
    { tournament_id: tournament.id, user_id: p2 },
  ]);

  const matches = await persistBracket(supabase, tournament.id, [p1, p2]);
  const r1 = matches.find((m) => m.round_number === 1 && m.game_id);
  if (!r1?.game_id) fail('R1 tournament game not spawned');
  const gameId = r1.game_id;
  ok(`tournament game: ${gameId}`);

  const participantRead = async () => {
    const { data, error } = await supabase
      .from('games')
      .select('fen, turn, status, white_clock_ms, black_clock_ms, tournament_id')
      .eq('id', gameId)
      .single();
    if (error) fail(`participant games read: ${error.message}`);
    return data;
  };

  const a = await participantRead();
  const b = await participantRead();
  if (a?.fen !== b?.fen || a?.turn !== b?.turn || a?.status !== b?.status) {
    fail('player reconnect: games row unstable between reload reads');
  }
  if (a?.tournament_id !== tournament.id) fail('tournament_id missing on game row');
  ok('player reconnect: FEN/turn/status stable across reload reads (pre-move)');

  await applyE4(supabase, gameId, p1);

  const afterMove = await participantRead();
  if (afterMove?.fen !== AFTER_E4_FEN || afterMove?.turn !== 'black') {
    fail(`player reconnect after move: fen/turn mismatch (${afterMove?.fen}, ${afterMove?.turn})`);
  }
  if (afterMove?.white_clock_ms == null || afterMove?.black_clock_ms == null) {
    fail('player reconnect after move: clocks missing on games row');
  }
  ok('player reconnect: FEN, turn, clocks restored after live move');

  const snap = await fetchSpectate(supabase, gameId);
  const g = snap?.game;
  if (!g || g.fen !== AFTER_E4_FEN || g.turn !== 'black') {
    fail('spectate RPC stale after move (fen/turn)');
  }
  if (g.tournament_id !== tournament.id) fail('spectate RPC missing tournament_id');
  assertMoveLogsOrdered(snap?.move_logs ?? []);
  ok('spectator: spectate RPC matches FEN/turn and ordered move_logs');

  for (let i = 0; i < SPECTATOR_CHURN_COUNT; i++) {
    const churn = await fetchSpectate(supabase, gameId);
    if (churn?.game?.fen !== AFTER_E4_FEN) fail(`spectator churn pass ${i + 1}: fen drift`);
    assertMoveLogsOrdered(churn?.move_logs ?? []);
  }
  ok(`spectator churn: ${SPECTATOR_CHURN_COUNT} join/leave cycles via spectate RPC (read-only)`);

  if (anonKey) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const anonSnap = await anon.rpc('get_public_spectate_game_snapshot', {
      p_game_id: gameId,
      p_viewer_ecosystem: 'adult',
    });
    if (!anonSnap.data?.game?.id) fail('anon spectate RPC returned null');
    const { data: anonLogs, error: anonLogErr } = await anon
      .from('game_move_logs')
      .select('id')
      .eq('game_id', gameId);
    if (anonLogErr && !String(anonLogErr.message).toLowerCase().includes('permission')) {
      fail(`anon game_move_logs unexpected error: ${anonLogErr.message}`);
    }
    if ((anonLogs ?? []).length > 0) fail('anon direct game_move_logs should be empty (RLS)');
    ok('spectator read-only: anon spectate RPC OK; direct move_logs blocked');
  } else {
    ok('spectator read-only: skipped anon RLS probe (set NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  }

  const { data: gRow } = await supabase
    .from('games')
    .select('white_player_id, black_player_id')
    .eq('id', gameId)
    .single();
  const winner = gRow?.white_player_id === p1 ? 'white_win' : 'black_win';

  const preFinishSpectate = await fetchSpectate(supabase, gameId);
  if (!preFinishSpectate?.game) fail('spectate unavailable before finish');

  const { error: finErr } = await supabase.rpc('finish_game_system', {
    p_game_id: gameId,
    p_result: winner,
    p_end_reason: 'timeout',
  });
  if (finErr) fail(`finish_game_system: ${finErr.message}`);

  const { data: finishedRow } = await supabase
    .from('games')
    .select('status, winner_id, result')
    .eq('id', gameId)
    .single();
  if (finishedRow?.status !== 'finished') fail('game not finished after finish_game_system');

  const postFinish = await fetchSpectate(supabase, gameId);
  const fg = postFinish?.game;
  if (!fg || fg.status !== 'finished' || !fg.winner_id) {
    fail('spectator reconnect after finish: spectate RPC missing finished state');
  }
  assertMoveLogsOrdered(postFinish?.move_logs ?? []);
  ok('finish transition: spectate RPC shows finished + winner while spectators connected');

  const { data: matchAfter } = await supabase
    .from('tournament_matches')
    .select('winner_id')
    .eq('id', r1.id)
    .single();
  if (!matchAfter?.winner_id) fail('bracket winner_id not set after finish');

  const { data: tDone } = await supabase.from('tournaments').select('status').eq('id', tournament.id).single();
  if (tDone?.status !== 'completed') fail(`2P bracket status ${tDone?.status} (expected completed)`);
  ok('tournament: 2P final finish sets status completed');

  const { data: stray, error: strayErr } = await supabase
    .from('games')
    .select('id, status')
    .eq('tournament_id', tournament.id)
    .in('status', ['active', 'waiting']);
  if (strayErr) fail(`ghost check: ${strayErr.message}`);
  if ((stray ?? []).length > 0) {
    fail(`ghost check: ${(stray ?? []).length} active/waiting tournament game(s) after completion`);
  }
  ok('ghost check: no active or waiting tournament games after completion');

  const { data: bracketGames, error: bgErr } = await supabase
    .from('tournament_matches')
    .select('game_id')
    .eq('tournament_id', tournament.id)
    .not('game_id', 'is', null);
  if (bgErr) fail(`ghost check (bracket): ${bgErr.message}`);
  const linkedIds = (bracketGames ?? []).map((m) => m.game_id).filter(Boolean);
  if (linkedIds.length !== 1) fail(`ghost check: expected 1 bracket-linked game, got ${linkedIds.length}`);
  const { data: finishedRows, error: finErr2 } = await supabase
    .from('games')
    .select('id, status')
    .in('id', linkedIds);
  if (finErr2) fail(`ghost check (status): ${finErr2.message}`);
  for (const g of finishedRows ?? []) {
    if (g.status !== 'finished') fail(`ghost check: bracket game ${g.id} status ${g.status}`);
  }
  ok('ghost check: bracket-linked game finished after spectator flow');

  const ghostChecks = {
    activeOrWaitingCount: 0,
    bracketLinkedGameCount: linkedIds.length,
    allBracketGamesFinished: true,
  };

  const report = {
    poll_realtime_boundary:
      'Spectators: primary path is get_public_spectate_game_snapshot on loadGameSnapshot (2s poll + focus). game_move_logs realtime INSERT often blocked by RLS for non-participants.',
    spectator_read_only: true,
    new_spectator_features: false,
    tournamentId: tournament.id,
    gameId,
    p1,
    p2,
    spectator_churn_cycles: SPECTATOR_CHURN_COUNT,
    ghostChecks,
  };

  if (!process.env.TOURNAMENT_SPECTATOR_KEEP) {
    await supabase.from('games').delete().eq('id', gameId);
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id);
    await supabase.from('tournament_entries').delete().eq('tournament_id', tournament.id);
    await supabase.from('tournaments').delete().eq('id', tournament.id);
    ok('cleanup');
  }

  console.log('\nPhase 1 — tournament spectator + reconnect churn verification PASSED');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
