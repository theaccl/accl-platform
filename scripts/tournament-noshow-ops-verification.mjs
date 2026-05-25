/**
 * Phase 1 — tournament no-show / missing-player operational boundary (verification only).
 *
 * Proves existing DB flow: operator may resolve a seated tournament game via
 * finish_game_system (white_win | black_win); advancement trigger propagates;
 * tournament can reach completed. Documents draw / absent-slot non-progression.
 *
 * Usage: node scripts/tournament-noshow-ops-verification.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: PHASE_1_4P_PLAYER_IDS, TOURNAMENT_NOSHOW_KEEP=1
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function buildExtendedBracketSlots(orderedUserIds) {
  const m = nextPowerOf2(orderedUserIds.length);
  const ext = orderedUserIds.map((id) => id);
  while (ext.length < m) ext.push(null);
  return ext;
}

function firstRoundPairings(extended) {
  const m = extended.length;
  const half = m / 2;
  const pairs = [];
  for (let i = 0; i < half; i++) {
    pairs.push([extended[i], extended[m - 1 - i]]);
  }
  return pairs;
}

function totalRoundsForBracketSize(bracketSize) {
  return Math.round(Math.log2(bracketSize));
}

function computeNextLink(roundNumber, matchNumber, totalRounds) {
  if (roundNumber >= totalRounds || roundNumber < 1) {
    return { nextRound: null, nextMatchNumber: null, advanceWinnerAs: null };
  }
  return {
    nextRound: roundNumber + 1,
    nextMatchNumber: Math.floor(matchNumber / 2),
    advanceWinnerAs: matchNumber % 2 === 0 ? 'player1' : 'player2',
  };
}

function planSingleEliminationBracket(orderedUserIds) {
  const ext = buildExtendedBracketSlots(orderedUserIds);
  const m = ext.length;
  const totalRounds = totalRoundsForBracketSize(m);
  const plans = [];
  const r1 = firstRoundPairings(ext);
  r1.forEach((pair, idx) => {
    const link = computeNextLink(1, idx, totalRounds);
    plans.push({
      roundNumber: 1,
      matchNumber: idx,
      player1Id: pair[0],
      player2Id: pair[1],
      nextRound: link.nextRound,
      nextMatchNumber: link.nextMatchNumber,
      advanceWinnerAs: link.advanceWinnerAs,
    });
  });
  for (let r = 2; r <= totalRounds; r++) {
    const count = m / 2 ** r;
    for (let idx = 0; idx < count; idx++) {
      const link = computeNextLink(r, idx, totalRounds);
      plans.push({
        roundNumber: r,
        matchNumber: idx,
        player1Id: null,
        player2Id: null,
        nextRound: link.nextRound,
        nextMatchNumber: link.nextMatchNumber,
        advanceWinnerAs: link.advanceWinnerAs,
      });
    }
  }
  return { plans, totalRounds };
}

function matchKey(round, matchNumber) {
  return `${round}:${matchNumber}`;
}

async function resolveFourPlayerIds(supabase) {
  const raw = process.env.PHASE_1_4P_PLAYER_IDS?.trim();
  if (raw) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length !== 4 || new Set(ids).size !== 4 || !ids.every((id) => UUID_RE.test(id))) {
      fail('PHASE_1_4P_PLAYER_IDS must be exactly 4 distinct UUIDs');
    }
    const { data, error } = await supabase.from('profiles').select('id').in('id', ids);
    if (error) fail(`profiles lookup: ${error.message}`);
    if ((data ?? []).length !== 4) fail('PHASE_1_4P_PLAYER_IDS: not all profiles exist');
    return ids;
  }

  const fallback = [
    process.env.BOT_USER_ID_CARDI?.trim(),
    process.env.BOT_USER_ID_AGGRO?.trim(),
    process.env.BOT_USER_ID_ENDGAME?.trim(),
  ].filter(Boolean);
  const { data: extra, error } = await supabase.from('profiles').select('id').limit(8);
  if (error) fail(`profiles: ${error.message}`);
  for (const row of extra ?? []) {
    const id = String(row.id);
    if (!fallback.includes(id)) fallback.push(id);
    if (fallback.length >= 4) break;
  }
  const four = fallback.slice(0, 4);
  if (four.length < 4 || new Set(four).size < 4) {
    fail('Need 4 profile UUIDs (set PHASE_1_4P_PLAYER_IDS or ensure >=4 profiles in DB)');
  }
  return four;
}

async function persistBracket(supabase, tournamentId, orderedUserIds) {
  const { plans, totalRounds } = planSingleEliminationBracket(orderedUserIds);
  const insertPayload = plans.map((p) => ({
    tournament_id: tournamentId,
    round_number: p.roundNumber,
    match_number: p.matchNumber,
    player1_id: p.player1Id,
    player2_id: p.player2Id,
    advance_winner_as: p.advanceWinnerAs,
    next_match_id: null,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from('tournament_matches')
    .insert(insertPayload)
    .select('id, round_number, match_number');
  if (insErr) fail(`insert matches: ${insErr.message}`);

  const idMap = new Map();
  for (const r of inserted ?? []) {
    idMap.set(matchKey(r.round_number, r.match_number), r.id);
  }

  for (const r of inserted ?? []) {
    if (r.round_number >= totalRounds) continue;
    const nextId = idMap.get(matchKey(r.round_number + 1, Math.floor(r.match_number / 2)));
    if (!nextId) continue;
    const { error: upErr } = await supabase
      .from('tournament_matches')
      .update({ next_match_id: nextId })
      .eq('id', r.id);
    if (upErr) fail(`link next_match: ${upErr.message}`);
  }

  const { error: stErr } = await supabase
    .from('tournaments')
    .update({ status: 'active' })
    .eq('id', tournamentId)
    .eq('status', 'pending');
  if (stErr) fail(`activate tournament: ${stErr.message}`);

  const { error: procErr } = await supabase.rpc('tournament_bootstrap_round', {
    p_tournament_id: tournamentId,
  });
  if (procErr) fail(`tournament_bootstrap_round: ${procErr.message}`);

  const { data: full, error: fetchErr } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number')
    .order('match_number');
  if (fetchErr) fail(`fetch matches: ${fetchErr.message}`);
  return full ?? [];
}

async function finishGameSystem(supabase, gameId, result, endReason) {
  const { error: finErr } = await supabase.rpc('finish_game_system', {
    p_game_id: gameId,
    p_result: result,
    p_end_reason: endReason,
  });
  if (finErr) fail(`finish_game_system ${gameId} (${result}/${endReason}): ${finErr.message}`);
}

async function finishGameAsWinner(supabase, gameId, winnerUserId, endReason) {
  const { data: g, error: gErr } = await supabase
    .from('games')
    .select('id, white_player_id, black_player_id, status, result, end_reason')
    .eq('id', gameId)
    .maybeSingle();
  if (gErr || !g) fail(`game ${gameId}: ${gErr?.message ?? 'missing'}`);
  if (g.status === 'finished') return g;

  const result =
    g.white_player_id === winnerUserId
      ? 'white_win'
      : g.black_player_id === winnerUserId
        ? 'black_win'
        : null;
  if (!result) fail(`winner ${winnerUserId} not seated in game ${gameId}`);

  await finishGameSystem(supabase, gameId, result, endReason);
  const { data: after } = await supabase
    .from('games')
    .select('id, status, result, winner_id, end_reason')
    .eq('id', gameId)
    .single();
  return after;
}

async function assertNoGhostTournamentGames(supabase, tournamentId, expectedGameCount) {
  const { data: stray, error: strayErr } = await supabase
    .from('games')
    .select('id, status')
    .eq('tournament_id', tournamentId)
    .in('status', ['active', 'waiting']);
  if (strayErr) fail(`ghost check (active/waiting): ${strayErr.message}`);
  if ((stray ?? []).length > 0) {
    const detail = (stray ?? []).map((g) => `${g.id.slice(0, 8)}:${g.status}`).join(', ');
    fail(`ghost games: ${(stray ?? []).length} active/waiting row(s): ${detail}`);
  }
  ok('ghost check: no active or waiting tournament games');

  const { data: matchRows, error: mErr } = await supabase
    .from('tournament_matches')
    .select('game_id')
    .eq('tournament_id', tournamentId)
    .not('game_id', 'is', null);
  if (mErr) fail(`ghost check (bracket games): ${mErr.message}`);

  const gameIds = (matchRows ?? []).map((m) => m.game_id).filter(Boolean);
  if (gameIds.length === 0) fail('ghost check: no bracket-linked game_ids');
  if (gameIds.length !== expectedGameCount) {
    fail(`ghost check: expected ${expectedGameCount} bracket-linked games, got ${gameIds.length}`);
  }

  const { data: gameRows, error: gErr } = await supabase
    .from('games')
    .select('id, status')
    .in('id', gameIds);
  if (gErr) fail(`ghost check (game status): ${gErr.message}`);

  const statusById = new Map((gameRows ?? []).map((g) => [g.id, g.status]));
  for (const gid of gameIds) {
    const status = statusById.get(gid);
    if (status !== 'finished') {
      fail(`bracket game ${gid} status ${status ?? 'missing'} (expected finished)`);
    }
  }
  ok(`ghost check: all ${gameIds.length} bracket-linked games finished`);

  return {
    activeOrWaitingCount: 0,
    bracketLinkedGameCount: gameIds.length,
    allBracketGamesFinished: true,
  };
}

async function createPendingTournament(supabase, creatorId, label) {
  const { data: tournament, error: tInsErr } = await supabase
    .from('tournaments')
    .insert({
      name: `Phase1 no-show ops ${label} ${new Date().toISOString().slice(0, 16)}`,
      status: 'pending',
      format: 'single_elimination',
      tempo: 'live',
      rated: false,
      created_by: creatorId,
      ecosystem_scope: 'adult',
      entry_fee_cents: null,
    })
    .select('id')
    .single();
  if (tInsErr || !tournament?.id) fail(`create tournament: ${tInsErr?.message ?? 'no id'}`);
  return tournament.id;
}

async function cleanupTournament(supabase, tournamentId, gameIds) {
  const ids = [...new Set(gameIds.filter(Boolean))];
  if (ids.length) await supabase.from('games').delete().in('id', ids);
  await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
  await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
  await supabase.from('tournaments').delete().eq('id', tournamentId);
}

async function verifyDrawDoesNotAdvance(supabase, players) {
  const [p1, p2, p3, p4] = players;
  const { data: creator } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  if (!creator?.id) fail('no profile for created_by');

  const tournamentId = await createPendingTournament(supabase, creator.id, 'draw-boundary');
  const { error: eInsErr } = await supabase.from('tournament_entries').insert(
    players.map((user_id) => ({ tournament_id: tournamentId, user_id })),
  );
  if (eInsErr) fail(`insert entries: ${eInsErr.message}`);

  const matches = await persistBracket(supabase, tournamentId, players);
  const r1m0 = matches.find((m) => m.round_number === 1 && m.match_number === 0);
  const r1m1 = matches.find((m) => m.round_number === 1 && m.match_number === 1);
  if (!r1m0?.game_id || !r1m1?.game_id) fail('draw boundary: R1 games missing');

  await finishGameSystem(supabase, r1m0.game_id, 'draw', 'draw_agreement');
  ok('draw boundary: finish_game_system(draw, draw_agreement) accepted');

  const { data: m0 } = await supabase
    .from('tournament_matches')
    .select('winner_id')
    .eq('id', r1m0.id)
    .single();
  if (m0?.winner_id) fail(`draw boundary: match winner_id set (${m0.winner_id})`);

  const { data: tAfterDraw } = await supabase
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .single();
  if (tAfterDraw?.status === 'completed') fail('draw boundary: tournament completed after draw');

  await finishGameAsWinner(supabase, r1m1.game_id, p2, 'checkmate');
  const { data: finalAfterOneWin } = await supabase
    .from('tournament_matches')
    .select('game_id, player1_id, player2_id, winner_id')
    .eq('tournament_id', tournamentId)
    .eq('round_number', 2)
    .maybeSingle();
  if (finalAfterOneWin?.game_id) {
    fail('draw boundary: final game spawned while sibling R1 match unresolved (draw)');
  }
  if (finalAfterOneWin?.winner_id) fail('draw boundary: final match has winner_id prematurely');

  ok('draw boundary: bracket does not advance on draw (match winner_id null, final not playable)');

  const gameIds = [r1m0.game_id, r1m1.game_id];
  if (!process.env.TOURNAMENT_NOSHOW_KEEP) {
    await cleanupTournament(supabase, tournamentId, gameIds);
    ok('draw boundary: cleanup');
  }
}

async function verifyOperatorForfeitCompletes(supabase, players) {
  const [p1, p2, p3, p4] = players;
  const { data: creator } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  if (!creator?.id) fail('no profile for created_by');

  const tournamentId = await createPendingTournament(supabase, creator.id, 'forfeit-path');
  const { error: eInsErr } = await supabase.from('tournament_entries').insert(
    players.map((user_id) => ({ tournament_id: tournamentId, user_id })),
  );
  if (eInsErr) fail(`insert entries: ${eInsErr.message}`);

  const matches = await persistBracket(supabase, tournamentId, players);
  const r1m0 = matches.find((m) => m.round_number === 1 && m.match_number === 0);
  const r1m1 = matches.find((m) => m.round_number === 1 && m.match_number === 1);
  if (!r1m0?.game_id || !r1m1?.game_id) fail('forfeit path: R1 games missing');

  const g0 = await finishGameAsWinner(supabase, r1m0.game_id, p1, 'resign');
  if (g0?.end_reason !== 'resign') fail(`forfeit path: end_reason ${g0?.end_reason}`);
  ok('forfeit path: R1 match 0 resolved via finish_game_system (resign label) → player1 advances');

  const g1 = await finishGameAsWinner(supabase, r1m1.game_id, p2, 'timeout');
  if (g1?.end_reason !== 'timeout') fail(`forfeit path: end_reason ${g1?.end_reason}`);
  ok('forfeit path: R1 match 1 resolved via finish_game_system (timeout label) → player2 advances');

  const { data: m0 } = await supabase
    .from('tournament_matches')
    .select('winner_id')
    .eq('id', r1m0.id)
    .single();
  const { data: m1 } = await supabase
    .from('tournament_matches')
    .select('winner_id')
    .eq('id', r1m1.id)
    .single();
  if (m0?.winner_id !== p1 || m1?.winner_id !== p2) {
    fail(`forfeit path: match winners ${m0?.winner_id}/${m1?.winner_id} expected ${p1}/${p2}`);
  }
  ok('forfeit path: tournament_handle_finished_game propagated winner_id on both R1 matches');

  const { data: final } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('round_number', 2)
    .maybeSingle();
  if (!final?.game_id) fail('forfeit path: final game not spawned');
  if (final.player1_id !== p1 || final.player2_id !== p2) {
    fail(`forfeit path: final feeders ${final.player1_id}/${final.player2_id}`);
  }
  ok('forfeit path: bracket continued — final seated and spawned');

  const champion = p1;
  await finishGameAsWinner(supabase, final.game_id, champion, 'resign');
  const { data: tFinal } = await supabase
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .single();
  if (tFinal?.status !== 'completed') fail(`forfeit path: status ${tFinal?.status}`);
  ok('forfeit path: tournament status completed after manual final resolution');

  const { data: root } = await supabase
    .from('tournament_matches')
    .select('winner_id')
    .eq('id', final.id)
    .single();
  if (root?.winner_id !== champion) fail(`forfeit path: champion ${root?.winner_id}`);

  const ghostChecks = await assertNoGhostTournamentGames(supabase, tournamentId, 3);

  const gameIds = [r1m0.game_id, r1m1.game_id, final.game_id];
  if (!process.env.TOURNAMENT_NOSHOW_KEEP) {
    await cleanupTournament(supabase, tournamentId, gameIds);
    ok('forfeit path: cleanup');
  }

  return {
    tournamentId,
    champion,
    endReasonsUsed: ['draw_agreement', 'resign', 'timeout'],
    ghostChecks,
    note: 'games_end_reason_check allows fixed set; use resign/timeout for no-show ops until dedicated labels exist',
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const players = await resolveFourPlayerIds(supabase);
  ok(`entrants: ${players.map((id) => id.slice(0, 8)).join(', ')}…`);

  await verifyDrawDoesNotAdvance(supabase, players);
  const report = await verifyOperatorForfeitCompletes(supabase, players);

  console.log('\nPhase 1 — tournament no-show ops verification PASSED');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
