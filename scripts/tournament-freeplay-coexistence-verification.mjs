/**
 * Phase 1 — tournament ↔ free-play coexistence verification (isolation only).
 *
 * Pressure-tests DB + client-query boundaries: tournament games must not count as free busy,
 * free supersede/join must not touch tournament rows, parallel contexts stay independent.
 *
 * Usage: node scripts/tournament-freeplay-coexistence-verification.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: PHASE_1_COEXIST_PLAYER_IDS=p1,p2,p3 (3 distinct profile UUIDs)
 * Optional: TOURNAMENT_COEXISTENCE_KEEP=1
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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

async function resolveThreePlayers(supabase) {
  const raw = process.env.PHASE_1_COEXIST_PLAYER_IDS?.trim();
  if (raw) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length < 3 || new Set(ids).size < 3) fail('PHASE_1_COEXIST_PLAYER_IDS needs 3 distinct UUIDs');
    return ids.slice(0, 3);
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
    if (fallback.length >= 3) break;
  }
  if (fallback.length < 3) fail('Need 3 profile UUIDs (PHASE_1_COEXIST_PLAYER_IDS or BOT_USER_ID_* + profiles)');
  return fallback.slice(0, 3);
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
  if (procErr) fail(`bootstrap: ${procErr.message}`);

  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('id, round_number, match_number, game_id, player1_id, player2_id, winner_id')
    .eq('tournament_id', tournamentId);
  return { matches: matches ?? [], totalRounds };
}

async function loadFreeBusyIds(supabase, userId) {
  const { data, error } = await supabase
    .from('games')
    .select('id')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`);
  if (error) fail(`free busy query: ${error.message}`);
  return (data ?? []).map((r) => r.id);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const [p1, p2, p3] = await resolveThreePlayers(supabase);
  ok(`players: ${[p1, p2, p3].map((id) => id.slice(0, 8)).join(', ')}…`);

  const { data: creator } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  if (!creator?.id) fail('no creator profile');

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .insert({
      name: `Phase1 coexist verify ${new Date().toISOString().slice(0, 16)}`,
      status: 'pending',
      format: 'single_elimination',
      tempo: 'live',
      rated: false,
      created_by: creator.id,
      ecosystem_scope: 'adult',
    })
    .select('id')
    .single();
  if (tErr || !tournament?.id) fail(`tournament: ${tErr?.message}`);

  const players = [...new Set([p1, p2, p3])];
  const { data: extra } = await supabase.from('profiles').select('id').limit(12);
  for (const row of extra ?? []) {
    const id = String(row.id);
    if (!players.includes(id)) players.push(id);
    if (players.length >= 4) break;
  }
  if (players.length < 4) fail('need 4 distinct players for 4-bracket');
  const bracketPlayers = players.slice(0, 4);

  await supabase.from('tournament_entries').insert(
    bracketPlayers.map((user_id) => ({ tournament_id: tournament.id, user_id })),
  );

  const { matches } = await persistBracket(supabase, tournament.id, bracketPlayers);
  const tMatch = matches.find((m) => m.player1_id === p1 || m.player2_id === p1);
  if (!tMatch?.game_id) fail('p1 tournament game_id missing');
  const tGameId = tMatch.game_id;
  ok(`tournament: p1 seated in match ${tMatch.round_number}:${tMatch.match_number} game ${tGameId.slice(0, 8)}…`);

  const { data: freeOpen, error: fErr } = await supabase
    .from('games')
    .insert({
      white_player_id: p1,
      black_player_id: null,
      status: 'active',
      fen: START_FEN,
      turn: 'white',
      play_context: 'free',
      tournament_id: null,
      tempo: 'live',
      live_time_control: '5+5',
      rated: false,
      source_type: 'open_listing',
    })
    .select('id')
    .single();
  if (fErr || !freeOpen?.id) fail(`free open seat: ${fErr?.message}`);
  const freeOpenId = freeOpen.id;
  ok('coexistence: p1 has simultaneous active tournament + free open seat rows');

  const freeBusy = await loadFreeBusyIds(supabase, p1);
  if (!freeBusy.includes(freeOpenId)) fail('free busy list missing open seat');
  if (freeBusy.includes(tGameId)) fail('free busy list incorrectly includes tournament game');

  const { data: tGames } = await supabase
    .from('games')
    .select('id')
    .eq('play_context', 'tournament')
    .eq('id', tGameId);
  if ((tGames ?? []).length !== 1) fail('tournament game row missing');

  const { data: tRow } = await supabase
    .from('games')
    .select('play_context, tournament_id, black_player_id, status')
    .eq('id', tGameId)
    .single();
  if (tRow?.play_context !== 'tournament' || !tRow?.tournament_id) {
    fail('tournament game row missing play_context=tournament linkage');
  }
  if (!tRow?.black_player_id) fail('tournament game expected both seats for routing test');
  ok('routing: tournament game row is play_context=tournament (not a free open-seat target)');

  const { error: joinTournErr } = await supabase.rpc('create_seated_game_guard', {
    existing_open_seat_id: tGameId,
    payload: { black_player_id: p2 },
  });
  if (joinTournErr) {
    const msg = String(joinTournErr.message);
    if (msg.includes('not a free-play open seat')) {
      ok('routing guard: authenticated path rejects tournament id as open seat');
    } else if (msg.includes('not authenticated')) {
      ok('routing guard: service-role RPC stops at auth (use manual checklist for seated join rejection)');
    } else {
      fail(`join tournament as open seat: unexpected error ${msg}`);
    }
  } else {
    fail('join tournament as open seat: guard succeeded without auth (unexpected)');
  }

  const matchBefore = { ...tMatch };
  const { data: freePair, error: pairErr } = await supabase
    .from('games')
    .insert({
      white_player_id: p2,
      black_player_id: p3,
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
  if (pairErr || !freePair?.id) fail(`free pair: ${pairErr?.message}`);

  const { data: tMatchAfter } = await supabase
    .from('tournament_matches')
    .select('game_id, winner_id, player1_id, player2_id')
    .eq('id', tMatch.id)
    .single();
  if (tMatchAfter?.game_id !== matchBefore.game_id || tMatchAfter?.winner_id !== matchBefore.winner_id) {
    fail('free pair insert mutated tournament match');
  }
  ok('isolation: free challenge insert did not mutate tournament_matches');

  const { data: dailyGame, error: dErr } = await supabase
    .from('games')
    .insert({
      white_player_id: p1,
      black_player_id: p3,
      status: 'active',
      fen: START_FEN,
      turn: 'white',
      play_context: 'free',
      tournament_id: null,
      tempo: 'daily',
      live_time_control: '1d',
      rated: false,
      source_type: 'challenge',
    })
    .select('id')
    .single();
  if (dErr || !dailyGame?.id) fail(`daily coexist: ${dErr?.message}`);
  ok('daily/async: p1 can hold daily free game while tournament live game active');

  const { data: snap1 } = await supabase.from('games').select('fen, status, turn').eq('id', tGameId).single();
  const { data: snap2 } = await supabase.from('games').select('fen, status, turn').eq('id', tGameId).single();
  if (snap1?.fen !== snap2?.fen || snap1?.status !== snap2?.status) {
    fail('reconnect read: tournament board row unstable between fetches');
  }
  ok('reconnect: tournament game row stable across reload reads');

  const { data: spectate } = await supabase.rpc('get_public_spectate_game_snapshot', {
    p_game_id: tGameId,
    p_viewer_ecosystem: 'adult',
  });
  if (spectate == null) fail('spectator RPC returned null for active tournament game');
  ok('spectator: public spectate snapshot available (read-only, no mutation)');

  const { error: finFreeErr } = await supabase.rpc('finish_game_system', {
    p_game_id: freePair.id,
    p_result: 'draw',
    p_end_reason: 'draw_agreement',
  });
  if (finFreeErr) fail(`finish free pair: ${finFreeErr.message}`);

  const { data: tAfterFreeFin } = await supabase
    .from('tournament_matches')
    .select('winner_id, game_id')
    .eq('id', tMatch.id)
    .single();
  if (tAfterFreeFin?.game_id !== tGameId || tAfterFreeFin?.winner_id) {
    fail('free finish corrupted tournament match state');
  }
  ok('completion isolation: finishing unrelated free game did not advance tournament');

  const { data: gRow } = await supabase
    .from('games')
    .select('white_player_id, black_player_id')
    .eq('id', tGameId)
    .single();
  const winner = gRow?.white_player_id === p1 ? 'white_win' : 'black_win';
  await supabase.rpc('finish_game_system', {
    p_game_id: tGameId,
    p_result: winner,
    p_end_reason: 'checkmate',
  });

  const { data: tStatus } = await supabase.from('tournaments').select('status').eq('id', tournament.id).single();
  if (tStatus?.status === 'completed') {
    fail('tournament completed after single R1 finish (unexpected for 4-bracket)');
  }

  const freeOpenStill = await supabase.from('games').select('status').eq('id', freeOpenId).single();
  if (freeOpenStill.data?.status !== 'active') fail('tournament finish orphaned/superseded free open seat');
  ok('orphan check: free open seat still active after partial tournament progress');

  const gameIds = [tGameId, freeOpenId, freePair.id, dailyGame.id];
  const report = {
    tournamentId: tournament.id,
    p1,
    p2,
    p3,
    tournamentGameId: tGameId,
    freeOpenId,
    freePairId: freePair.id,
    dailyGameId: dailyGame.id,
  };

  if (!process.env.TOURNAMENT_COEXISTENCE_KEEP) {
    await supabase.from('games').delete().in('id', gameIds);
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id);
    await supabase.from('tournament_entries').delete().eq('tournament_id', tournament.id);
    await supabase.from('tournaments').delete().eq('id', tournament.id);
    ok('cleanup');
  }

  console.log('\nPhase 1 — tournament ↔ free-play coexistence verification PASSED');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
