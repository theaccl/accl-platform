/**
 * Phase 1 — tournament recovery / interrupted flow (verification only).
 *
 * Proves operational recoverability:
 * - partial R1 (one game finished, one active)
 * - re-bootstrap idempotency (no duplicate games)
 * - operator can finish stalled R1 and complete tournament
 * - free-play activity does not mutate bracket during interruption
 * - repeated reads / spectate RPCs remain coherent
 *
 * Usage: node scripts/tournament-recovery-verification.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: PHASE_1_4P_PLAYER_IDS, TOURNAMENT_RECOVERY_KEEP=1
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
  return matches ?? [];
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

async function loadRecoveryFingerprint(supabase, tournamentId) {
  const { data: t } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
  const { data: matches } = await supabase
    .from('tournament_matches')
    .select('id, round_number, match_number, game_id, winner_id, player1_id, player2_id')
    .eq('tournament_id', tournamentId)
    .order('round_number')
    .order('match_number');
  const gameIds = [...new Set((matches ?? []).map((m) => m.game_id).filter(Boolean))];
  const { data: games } = gameIds.length
    ? await supabase.from('games').select('id, status').in('id', gameIds)
    : { data: [] };
  const statusByGame = new Map((games ?? []).map((g) => [g.id, g.status]));
  return {
    tournamentStatus: t?.status ?? null,
    matches: (matches ?? []).map((m) => ({
      r: m.round_number,
      n: m.match_number,
      gid: m.game_id,
      w: m.winner_id,
      gs: m.game_id ? statusByGame.get(m.game_id) ?? null : null,
    })),
  };
}

function fingerprintsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function spectateChurn(supabase, gameId, cycles = 3) {
  for (let i = 0; i < cycles; i++) {
    const { data, error } = await supabase.rpc('get_public_spectate_game_snapshot', {
      p_game_id: gameId,
      p_viewer_ecosystem: 'adult',
    });
    if (error) fail(`spectate churn: ${error.message}`);
    if (!data?.game?.id) fail(`spectate churn pass ${i + 1}: null snapshot`);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const [p1, p2, p3, p4] = await resolveFourPlayers(supabase);
  ok(`players: ${[p1, p2, p3, p4].map((id) => id.slice(0, 8)).join(', ')}…`);

  const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .insert({
      name: `P1 recovery ${Date.now()}`,
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

  await supabase.from('tournament_entries').insert(
    [p1, p2, p3, p4].map((user_id) => ({ tournament_id: tournament.id, user_id })),
  );

  const matches = await persistBracket(supabase, tournament.id, [p1, p2, p3, p4]);
  const r1 = matches.filter((m) => m.round_number === 1);
  if (r1.length !== 2) fail(`expected 2 R1 matches, got ${r1.length}`);
  const r1m0 = r1.find((m) => m.match_number === 0);
  const r1m1 = r1.find((m) => m.match_number === 1);
  if (!r1m0?.game_id || !r1m1?.game_id) fail('R1 games not spawned');

  const fp1 = await loadRecoveryFingerprint(supabase, tournament.id);
  const fp2 = await loadRecoveryFingerprint(supabase, tournament.id);
  if (!fingerprintsEqual(fp1, fp2)) fail('operator reload: tournament fingerprint unstable');
  ok('operator reload: tournament + match reads stable across refresh simulation');

  const semi0Winner = p1;
  await finishAsWinner(supabase, r1m0.game_id, semi0Winner);

  const { data: g0 } = await supabase.from('games').select('status').eq('id', r1m0.game_id).single();
  const { data: g1 } = await supabase.from('games').select('status').eq('id', r1m1.game_id).single();
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
  if (g0?.status !== 'finished' || g1?.status !== 'active') {
    fail(`partial round: expected one finished one active (got ${g0?.status}, ${g1?.status})`);
  }
  if (!m0?.winner_id || m1?.winner_id) fail('partial round: winner_id on wrong matches');
  ok('partial round: one R1 finished, one R1 still active');

  const { data: finalProbe } = await supabase
    .from('tournament_matches')
    .select('game_id, player1_id, player2_id')
    .eq('tournament_id', tournament.id)
    .eq('round_number', 2)
    .maybeSingle();
  if (finalProbe?.game_id) fail('partial round: final game spawned too early');
  ok('advancement: final not spawned until both R1 complete');

  await spectateChurn(supabase, r1m0.game_id, 3);
  await spectateChurn(supabase, r1m1.game_id, 3);
  ok('spectator reads: repeated spectate RPC coherent during stalled round');

  const gameIdsBefore = [r1m0.game_id, r1m1.game_id].sort().join(',');
  for (let i = 0; i < 2; i++) {
    const { error: rebErr } = await supabase.rpc('tournament_bootstrap_round', {
      p_tournament_id: tournament.id,
    });
    if (rebErr) fail(`re-bootstrap ${i + 1}: ${rebErr.message}`);
  }
  const { data: r1After } = await supabase
    .from('tournament_matches')
    .select('game_id')
    .eq('tournament_id', tournament.id)
    .eq('round_number', 1);
  const gameIdsAfter = (r1After ?? []).map((m) => m.game_id).filter(Boolean).sort().join(',');
  if (gameIdsBefore !== gameIdsAfter) fail('re-bootstrap mutated R1 game_id links');

  const { count: gameCount } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id)
    .in('status', ['active', 'finished', 'waiting']);
  if ((gameCount ?? 0) > 2) fail(`re-bootstrap created extra tournament games (count=${gameCount})`);
  ok('re-bootstrap idempotent: same R1 game_ids, no duplicate tournament games');

  const matchBeforeFree = await supabase
    .from('tournament_matches')
    .select('game_id, winner_id')
    .eq('id', r1m1.id)
    .single();

  const { data: freeGame, error: fErr } = await supabase
    .from('games')
    .insert({
      white_player_id: p3,
      black_player_id: p4,
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

  await supabase.rpc('finish_game_system', {
    p_game_id: freeGame.id,
    p_result: 'draw',
    p_end_reason: 'draw_agreement',
  });

  const matchAfterFree = await supabase
    .from('tournament_matches')
    .select('game_id, winner_id')
    .eq('id', r1m1.id)
    .single();
  if (
    matchAfterFree.data?.game_id !== matchBeforeFree.data?.game_id ||
    matchAfterFree.data?.winner_id !== matchBeforeFree.data?.winner_id
  ) {
    fail('free-play during interruption mutated tournament match');
  }
  ok('free-play isolation: unrelated finish did not mutate tournament bracket');

  const semi1Winner = p2;
  await finishAsWinner(supabase, r1m1.game_id, semi1Winner);
  ok('stalled round: operator finished second R1 via finish_game_system');

  const fpMid = await loadRecoveryFingerprint(supabase, tournament.id);
  const fpMid2 = await loadRecoveryFingerprint(supabase, tournament.id);
  if (!fingerprintsEqual(fpMid, fpMid2)) fail('snapshot reads incoherent after second R1 finish');
  ok('snapshot coherence: repeated reads stable after partial→full R1');

  const { data: finalMatch } = await supabase
    .from('tournament_matches')
    .select('id, game_id, player1_id, player2_id')
    .eq('tournament_id', tournament.id)
    .eq('round_number', 2)
    .maybeSingle();
  if (!finalMatch?.game_id) fail('final game not spawned after both R1 complete');
  if (finalMatch.player1_id !== semi0Winner || finalMatch.player2_id !== semi1Winner) {
    fail('final feeders incorrect after recovery');
  }
  ok('advancement: final seated correctly after interruption');

  const champion = semi1Winner;
  await finishAsWinner(supabase, finalMatch.game_id, champion);

  const { data: tDone } = await supabase.from('tournaments').select('status').eq('id', tournament.id).single();
  if (tDone?.status !== 'completed') fail(`tournament status ${tDone?.status} (expected completed)`);

  const fpDone = await loadRecoveryFingerprint(supabase, tournament.id);
  const fpDone2 = await loadRecoveryFingerprint(supabase, tournament.id);
  if (!fingerprintsEqual(fpDone, fpDone2)) fail('post-completion snapshot reads unstable');
  ok('completion stable: tournament completed; reads coherent after interruption');

  const { error: postBootstrapErr } = await supabase.rpc('tournament_bootstrap_round', {
    p_tournament_id: tournament.id,
  });
  if (postBootstrapErr) fail(`post-completion bootstrap: ${postBootstrapErr.message}`);
  ok('post-completion: re-bootstrap no-op safe (tournament completed)');

  const report = {
    automatic_recovery: false,
    tournamentId: tournament.id,
    gameIds: { r1_0: r1m0.game_id, r1_1: r1m1.game_id, final: finalMatch.game_id },
    champion,
    freeGameId: freeGame.id,
  };

  const allGameIds = [r1m0.game_id, r1m1.game_id, finalMatch.game_id, freeGame.id];
  if (!process.env.TOURNAMENT_RECOVERY_KEEP) {
    await supabase.from('games').delete().in('id', allGameIds);
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id);
    await supabase.from('tournament_entries').delete().eq('tournament_id', tournament.id);
    await supabase.from('tournaments').delete().eq('id', tournament.id);
    ok('cleanup');
  }

  console.log('\nPhase 1 — tournament recovery / interrupted flow verification PASSED');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
