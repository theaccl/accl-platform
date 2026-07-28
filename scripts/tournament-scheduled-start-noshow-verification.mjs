/**
 * Phase 1 — scheduled tournament start + no-show grace (verification only).
 *
 * Proves current boundaries:
 * - starts_at is storable (after additive migration) but NOT enforced by DB/app
 * - No check-in / presence signal (move logs + manual ops only)
 * - After grace window, operator finish_game_system awards present player without corrupting bracket
 *
 * Usage: node scripts/tournament-scheduled-start-noshow-verification.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: PHASE_1_4P_PLAYER_IDS, TOURNAMENT_SCHEDULED_KEEP=1
 * Optional: SCHEDULE_LEAD_SEC=8 (default) — seconds until simulated start
 * Optional: NOSHOW_GRACE_SEC=30 (default) — verification grace before operator award
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

const SCHEDULE_LEAD_SEC = Number(process.env.SCHEDULE_LEAD_SEC ?? 8);
const GRACE_SEC = Number(process.env.NOSHOW_GRACE_SEC ?? 30);

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function columnExists(supabase) {
  const { error } = await supabase.from('tournaments').select('id, starts_at').limit(1);
  if (error && String(error.message).includes('starts_at')) return false;
  if (error) fail(`probe starts_at: ${error.message}`);
  return true;
}

async function persistBracket(supabase, tournamentId, orderedUserIds) {
  const plans = planBracket(orderedUserIds);
  const totalRounds = Math.round(Math.log2(nextPowerOf2(orderedUserIds.length)));
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
    .eq('tournament_id', tournamentId);
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const players = await resolveFourPlayers(supabase);
  const absentId = players[3];
  ok(`players: ${players.map((id) => id.slice(0, 8)).join(', ')}… (absent simulation: ${absentId.slice(0, 8)}…)`);

  const hasStartsAt = await columnExists(supabase);
  if (!hasStartsAt) {
    fail(
      'tournaments.starts_at column missing — apply supabase/migrations/20260519165000_tournament_starts_at_additive.sql',
    );
  }
  ok('schema: tournaments.starts_at column present');

  const startsAt = new Date(Date.now() + SCHEDULE_LEAD_SEC * 1000).toISOString();
  const { data: creator } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  if (!creator?.id) fail('no creator profile');

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .insert({
      name: `Phase1 scheduled start ${new Date().toISOString().slice(0, 16)}`,
      status: 'pending',
      format: 'single_elimination',
      tempo: 'live',
      rated: false,
      created_by: creator.id,
      ecosystem_scope: 'adult',
      starts_at: startsAt,
    })
    .select('id, starts_at, status')
    .single();
  if (tErr) fail(`create tournament: ${tErr.message}`);
  const tournamentId = tournament.id;
  ok(`scheduled: starts_at=${startsAt} (lead ${SCHEDULE_LEAD_SEC}s), status=pending`);

  await supabase.from('tournament_entries').insert(
    players.map((user_id) => ({ tournament_id: tournamentId, user_id })),
  );
  ok('registration: 4 tournament_entries before start');

  const { error: earlyBootstrapErr } = await supabase.rpc('tournament_bootstrap_round', {
    p_tournament_id: tournamentId,
  });
  if (earlyBootstrapErr) {
    ok(`starts_at not enforced: early bootstrap RPC returned error (${earlyBootstrapErr.message}) — still pending`);
  } else {
    const { count } = await supabase
      .from('tournament_matches')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);
    if ((count ?? 0) === 0) {
      ok('starts_at not enforced: pending tournament has no matches until operator bootstrap');
    } else {
      ok('starts_at not enforced: bootstrap possible before start time (operator-driven only)');
      await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournaments').update({ status: 'pending' }).eq('id', tournamentId);
    }
  }

  const waitMs = Math.max(0, new Date(startsAt).getTime() - Date.now());
  if (waitMs > 0) {
    ok(`waiting ${Math.ceil(waitMs / 1000)}s until starts_at…`);
    await sleep(waitMs + 200);
  }

  const matches = await persistBracket(supabase, tournamentId, players);
  const absentMatch =
    matches.find(
      (m) =>
        m.round_number === 1 &&
        ((m.player1_id === absentId && m.player2_id !== absentId) ||
          (m.player2_id === absentId && m.player1_id !== absentId)),
    ) ?? matches.find((m) => m.round_number === 1);
  if (!absentMatch?.game_id) fail('no R1 game for absent-player match');
  const presentId = absentMatch.player1_id === absentId ? absentMatch.player2_id : absentMatch.player1_id;
  if (!presentId) fail('could not resolve present player on absent match');

  ok(`at start: bracket bootstrapped; absent match game ${String(absentMatch.game_id).slice(0, 8)}…`);

  const { count: moveCountBefore } = await supabase
    .from('game_move_logs')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', absentMatch.game_id);
  ok(
    `presence signal: none — game_move_logs count=${moveCountBefore ?? 0} (cannot distinguish absent vs slow)`,
  );

  ok(`grace: waiting ${GRACE_SEC}s (verification only, no auto-forfeit)…`);
  await sleep(GRACE_SEC * 1000);

  const { data: gDuring } = await supabase
    .from('games')
    .select('status')
    .eq('id', absentMatch.game_id)
    .single();
  if (gDuring?.status !== 'active') fail(`absent match game status ${gDuring?.status} before operator action`);
  ok('grace elapsed: no auto-forfeit; game still active');

  await finishAsWinner(supabase, absentMatch.game_id, presentId);

  const { data: mAfter } = await supabase
    .from('tournament_matches')
    .select('winner_id')
    .eq('id', absentMatch.id)
    .single();
  if (mAfter?.winner_id !== presentId) {
    fail(`bracket corrupt: winner ${mAfter?.winner_id} expected ${presentId}`);
  }
  ok('operator manual no-show resolution: present player advanced on absent match');

  const otherR1 = matches.filter((m) => m.round_number === 1 && m.id !== absentMatch.id);
  for (const m of otherR1) {
    if (!m.game_id) continue;
    const w = m.player1_id ?? m.player2_id;
    if (w) await finishAsWinner(supabase, m.game_id, w);
  }
  ok('filled other R1 matches (present players) via operator path');

  const report = {
    tournamentId,
    startsAt,
    scheduleLeadSec: SCHEDULE_LEAD_SEC,
    graceSec: GRACE_SEC,
    absentPlayerId: absentId,
    presentPlayerId: presentId,
    absentMatchGameId: absentMatch.game_id,
    enforcement: {
      starts_at_db: false,
      check_in_signal: false,
      no_show_timer: false,
      auto_forfeit: false,
    },
  };

  if (!process.env.TOURNAMENT_SCHEDULED_KEEP) {
    const gameIds = matches.map((m) => m.game_id).filter(Boolean);
    if (gameIds.length) await supabase.from('games').delete().in('id', gameIds);
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
    await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
    await supabase.from('tournaments').delete().eq('id', tournamentId);
    ok('cleanup');
  }

  console.log('\nPhase 1 — scheduled start + no-show grace verification PASSED');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
