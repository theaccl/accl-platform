/**
 * Phase 1 — 8-player manual KO verification (existing flow only).
 *
 * Proves: 8 entries → bracket (7 matches) → R1 (4 games) → R2 (2 games) → final → champion.
 *
 * Usage: node scripts/tournament-8p-ko-verification.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: PHASE_1_8P_PLAYER_IDS=uuid1,...,uuid8 (seed order, 8 distinct)
 * Default: BOT_USER_ID_* from env + profiles; provisions auth/profile rows if still short
 * Optional: TOURNAMENT_8P_KEEP=1
 */
import { randomUUID } from 'node:crypto';
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

const ENTRANT_COUNT = 8;

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

/** Deterministic winner: player1 slot (feeder advance_as player1 path in verification). */
function pickWinner(match) {
  if (!match.player1_id && !match.player2_id) return null;
  if (!match.player2_id) return match.player1_id;
  if (!match.player1_id) return match.player2_id;
  return match.player1_id;
}

async function provisionVerificationProfile(supabase, index) {
  const email = `phase1-8p-ko-${Date.now()}-${index}@accl-phase1.invalid`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) fail(`provision auth user: ${error.message}`);
  const userId = data.user.id;

  const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (existing?.id) return String(existing.id);

  const username = `p1v8_${String(userId).replace(/-/g, '').slice(0, 12)}`;
  const { error: insErr } = await supabase.from('profiles').insert({ id: userId, username });
  if (insErr) fail(`provision profile: ${insErr.message}`);
  return userId;
}

async function resolveEightPlayerIds(supabase) {
  const raw = process.env.PHASE_1_8P_PLAYER_IDS?.trim();
  if (raw) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length !== ENTRANT_COUNT || new Set(ids).size !== ENTRANT_COUNT) {
      fail(`PHASE_1_8P_PLAYER_IDS must be exactly ${ENTRANT_COUNT} distinct UUIDs`);
    }
    if (!ids.every((id) => UUID_RE.test(id))) fail('PHASE_1_8P_PLAYER_IDS: invalid UUID');
    const { data, error } = await supabase.from('profiles').select('id').in('id', ids);
    if (error) fail(`profiles lookup: ${error.message}`);
    if ((data ?? []).length !== ENTRANT_COUNT) fail('PHASE_1_8P_PLAYER_IDS: not all profiles exist');
    return ids;
  }

  const fallback = [
    process.env.BOT_USER_ID_CARDI?.trim(),
    process.env.BOT_USER_ID_AGGRO?.trim(),
    process.env.BOT_USER_ID_ENDGAME?.trim(),
  ].filter(Boolean);
  const { data: extra, error } = await supabase.from('profiles').select('id').limit(ENTRANT_COUNT + 8);
  if (error) fail(`profiles: ${error.message}`);
  for (const row of extra ?? []) {
    const id = String(row.id);
    if (!fallback.includes(id)) fallback.push(id);
    if (fallback.length >= ENTRANT_COUNT) break;
  }
  const unique = [...new Set(fallback.filter(Boolean))];
  while (unique.length < ENTRANT_COUNT) {
    unique.push(await provisionVerificationProfile(supabase, unique.length));
  }
  return unique.slice(0, ENTRANT_COUNT);
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
  return { matches: full ?? [], totalRounds };
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

async function reloadMatches(supabase, tournamentId) {
  const { data, error } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number')
    .order('match_number');
  if (error) fail(`reload matches: ${error.message}`);
  return data ?? [];
}

async function finishRound(supabase, matches, roundNumber) {
  const round = matches.filter((m) => m.round_number === roundNumber);
  const winners = [];
  for (const m of round) {
    if (!m.game_id) fail(`round ${roundNumber} match ${m.match_number}: missing game_id`);
    const w = pickWinner(m);
    if (!w) fail(`round ${roundNumber} match ${m.id}: cannot pick winner`);
    await finishGameAsWinner(supabase, m.game_id, w);
    winners.push({ matchNumber: m.match_number, winner: w, gameId: m.game_id });
  }
  return winners;
}

function assertRoundGames(matches, roundNumber, expectedCount) {
  const round = matches.filter((m) => m.round_number === roundNumber);
  if (round.length !== expectedCount) {
    fail(`round ${roundNumber}: expected ${expectedCount} matches, got ${round.length}`);
  }
  for (const m of round) {
    if (!m.game_id) fail(`round ${roundNumber} match ${m.match_number}: missing game_id`);
    if (!m.player1_id || !m.player2_id) {
      fail(`round ${roundNumber} match ${m.match_number}: missing player slot`);
    }
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const players = await resolveEightPlayerIds(supabase);
  ok(`using ${ENTRANT_COUNT} entrants (seed order): ${players.map((id) => id.slice(0, 8)).join(', ')}…`);

  const { plans, bracketSize, totalRounds } = planSingleEliminationBracket(players);
  if (bracketSize !== 8 || plans.length !== 7 || totalRounds !== 3) {
    fail(`planner expected 8/7/3, got size=${bracketSize} matches=${plans.length} rounds=${totalRounds}`);
  }
  ok('planner: 8-bracket, 7 matches, 3 rounds');

  const { data: creator } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  if (!creator?.id) fail('no profile for created_by');

  const { data: tournament, error: tInsErr } = await supabase
    .from('tournaments')
    .insert({
      name: `Phase1 8P KO verify ${new Date().toISOString().slice(0, 16)}`,
      status: 'pending',
      format: 'single_elimination',
      tempo: 'live',
      rated: false,
      created_by: creator.id,
      ecosystem_scope: 'adult',
      entry_fee_cents: null,
    })
    .select('id')
    .single();
  if (tInsErr || !tournament?.id) fail(`create tournament: ${tInsErr?.message ?? 'no id'}`);
  const tournamentId = tournament.id;
  ok(`registration: pending tournament ${tournamentId.slice(0, 8)}…`);

  const { error: eInsErr } = await supabase.from('tournament_entries').insert(
    players.map((user_id) => ({ tournament_id: tournamentId, user_id })),
  );
  if (eInsErr) fail(`insert entries: ${eInsErr.message}`);
  ok(`registration: ${ENTRANT_COUNT} tournament_entries`);

  const { matches: afterBootstrap, totalRounds: tr } = await persistBracket(supabase, tournamentId, players);
  if (afterBootstrap.length !== 7) fail(`expected 7 matches, got ${afterBootstrap.length}`);
  ok('bracket: 7 matches, tournament active');

  assertRoundGames(afterBootstrap, 1, 4);
  ok('round 1: 4 games spawned');

  const r1Winners = await finishRound(supabase, afterBootstrap, 1);
  ok(`round 1: ${r1Winners.length} winners recorded`);

  let matches = await reloadMatches(supabase, tournamentId);
  assertRoundGames(matches, 2, 2);
  ok('round 2: 2 games spawned after R1');

  const r2Winners = await finishRound(supabase, matches, 2);
  ok(`round 2: ${r2Winners.length} winners recorded`);

  matches = await reloadMatches(supabase, tournamentId);
  assertRoundGames(matches, 3, 1);
  ok('final: 1 game spawned after R2');

  const final = matches.find((m) => m.round_number === 3 && m.match_number === 0);
  if (!final?.game_id) fail('final match missing');
  const champion = pickWinner(final);
  if (!champion) fail('cannot pick final champion');
  await finishGameAsWinner(supabase, final.game_id, champion);
  ok(`final: champion ${champion.slice(0, 8)}…`);

  const { data: tFinal } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
  if (tFinal?.status !== 'completed') fail(`tournament status ${tFinal?.status} (expected completed)`);
  ok('tournament status: completed');

  const { data: root } = await supabase
    .from('tournament_matches')
    .select('winner_id, next_match_id, round_number')
    .eq('tournament_id', tournamentId)
    .is('next_match_id', null)
    .maybeSingle();
  if (root?.winner_id !== champion) {
    fail(`root match winner ${root?.winner_id} (expected ${champion})`);
  }
  if (root?.round_number !== tr) fail(`root round ${root?.round_number} (expected ${tr})`);
  ok('champion: final match winner_id matches');

  const allGameIds = matches.map((m) => m.game_id).filter(Boolean);
  const report = {
    tournamentId,
    players,
    champion,
    bracketSize,
    matchCount: matches.length,
    gameCount: allGameIds.length,
    r1Winners: r1Winners.map((w) => w.winner),
    r2Winners: r2Winners.map((w) => w.winner),
  };

  if (!process.env.TOURNAMENT_8P_KEEP) {
    if (allGameIds.length) await supabase.from('games').delete().in('id', allGameIds);
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
    await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
    await supabase.from('tournaments').delete().eq('id', tournamentId);
    ok('cleanup: removed verification tournament data');
  } else {
    console.log('KEEP: TOURNAMENT_8P_KEEP=1 — tournament left in DB');
  }

  console.log('\nPhase 1 — 8-player KO verification PASSED');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
