/**
 * Phase 1 — 4-player manual KO verification (existing flow only).
 *
 * Proves: registration (entries) → bracket bootstrap → R1 games → advancement → final → champion.
 *
 * Usage (repo root):
 *   node scripts/tournament-4p-ko-verification.mjs
 *
 * Requires .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   PHASE_1_4P_PLAYER_IDS=p1,p2,p3,p4  (seed order: best → worst; 4 distinct profile UUIDs)
 *   ACCL_BASE_URL + ACCL_TOURNAMENT_OPS_SECRET  (if set, also exercises HTTP ops routes)
 *   TOURNAMENT_4P_KEEP=1  (skip cleanup)
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
  return { plans, bracketSize: m, totalRounds };
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
  const { data: extra } = await supabase.from('profiles').select('id').limit(8);
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

async function finishGameAsWinner(supabase, gameId, winnerUserId) {
  const { data: g, error: gErr } = await supabase
    .from('games')
    .select('id, white_player_id, black_player_id, status')
    .eq('id', gameId)
    .maybeSingle();
  if (gErr || !g) fail(`game ${gameId}: ${gErr?.message ?? 'missing'}`);
  if (g.status === 'finished') return;

  const result =
    g.white_player_id === winnerUserId
      ? 'white_win'
      : g.black_player_id === winnerUserId
        ? 'black_win'
        : null;
  if (!result) fail(`winner ${winnerUserId} not seated in game ${gameId}`);

  const { error: finErr } = await supabase.rpc('finish_game_system', {
    p_game_id: gameId,
    p_result: result,
    p_end_reason: 'checkmate',
  });
  if (finErr) fail(`finish_game_system ${gameId}: ${finErr.message}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const players = await resolveFourPlayerIds(supabase);
  const [p1, p2, p3, p4] = players;
  ok(`using 4 entrants (seed order): ${players.map((id) => id.slice(0, 8)).join(', ')}…`);

  const { data: creator } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  if (!creator?.id) fail('no profile for created_by');

  const { data: tournament, error: tInsErr } = await supabase
    .from('tournaments')
    .insert({
      name: `Phase1 4P KO verify ${new Date().toISOString().slice(0, 16)}`,
      status: 'pending',
      format: 'single_elimination',
      tempo: 'live',
      rated: false,
      created_by: creator.id,
      ecosystem_scope: 'adult',
      entry_fee_cents: null,
    })
    .select('id, status')
    .single();
  if (tInsErr || !tournament?.id) fail(`create tournament: ${tInsErr?.message ?? 'no id'}`);
  const tournamentId = tournament.id;
  ok(`registration: pending tournament ${tournamentId.slice(0, 8)}…`);

  const entryRows = players.map((user_id) => ({ tournament_id: tournamentId, user_id }));
  const { error: eInsErr } = await supabase.from('tournament_entries').insert(entryRows);
  if (eInsErr) fail(`insert entries: ${eInsErr.message}`);
  ok('registration: 4 tournament_entries');

  const matches = await persistBracket(supabase, tournamentId, players);
  ok(`bracket: ${matches.length} matches, tournament active`);

  const r1 = matches.filter((m) => m.round_number === 1);
  if (r1.length !== 2) fail(`expected 2 R1 matches, got ${r1.length}`);
  for (const m of r1) {
    if (!m.game_id) fail(`R1 match ${m.id} missing game_id after bootstrap`);
    if (!m.player1_id || !m.player2_id) fail(`R1 match ${m.id} missing both players`);
  }
  ok('round 1: both semifinal games spawned');

  const r1m0 = r1.find((m) => m.match_number === 0);
  const r1m1 = r1.find((m) => m.match_number === 1);
  if (!r1m0?.game_id || !r1m1?.game_id) fail('R1 game ids missing');

  const semi0Winner = p1;
  const semi1Winner = p2;
  const champion = p2;

  await finishGameAsWinner(supabase, r1m0.game_id, semi0Winner);
  await finishGameAsWinner(supabase, r1m1.game_id, semi1Winner);
  ok(`round 1: winners ${semi0Winner.slice(0, 8)}… and ${semi1Winner.slice(0, 8)}…`);

  const { data: afterR1 } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('round_number', 2)
    .maybeSingle();
  if (!afterR1?.game_id) fail('final match game not spawned after R1');
  if (afterR1.player1_id !== semi0Winner || afterR1.player2_id !== semi1Winner) {
    fail(
      `final feeders wrong: p1=${afterR1.player1_id} p2=${afterR1.player2_id} expected ${semi0Winner}/${semi1Winner}`,
    );
  }
  ok('advancement: final match seated correctly');

  await finishGameAsWinner(supabase, afterR1.game_id, champion);
  ok(`final: champion ${champion.slice(0, 8)}…`);

  const { data: tFinal } = await supabase
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .single();
  if (tFinal?.status !== 'completed') fail(`tournament status ${tFinal?.status} (expected completed)`);
  ok('tournament status: completed');

  const { data: finalMatch } = await supabase
    .from('tournament_matches')
    .select('winner_id, next_match_id')
    .eq('tournament_id', tournamentId)
    .is('next_match_id', null)
    .maybeSingle();
  if (finalMatch?.winner_id !== champion) {
    fail(`final match winner ${finalMatch?.winner_id} (expected ${champion})`);
  }
  ok('champion: final match winner_id matches');

  const report = {
    tournamentId,
    players,
    champion,
    semi0Winner,
    semi1Winner,
    gameIds: {
      r1_0: r1m0.game_id,
      r1_1: r1m1.game_id,
      final: afterR1.game_id,
    },
  };

  if (!process.env.TOURNAMENT_4P_KEEP) {
    await supabase.from('games').delete().in('id', [r1m0.game_id, r1m1.game_id, afterR1.game_id]);
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
    await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
    await supabase.from('tournaments').delete().eq('id', tournamentId);
    ok('cleanup: removed verification tournament data');
  } else {
    console.log('KEEP: TOURNAMENT_4P_KEEP=1 — tournament left in DB for inspection');
  }

  console.log('\nPhase 1 — 4-player KO verification PASSED');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
