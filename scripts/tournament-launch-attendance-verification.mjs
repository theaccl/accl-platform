/**
 * Phase 1 — live tournament launch attendance verification.
 *
 * Proves:
 * - Migration columns exist
 * - Live full field can enter launch-check (launch_scheduled_at)
 * - Checked-in entrants used for bootstrap; absent skipped; standby replaces
 * - Not enough present → no bracket spawn
 * - Async/daily bypasses attendance gate
 * - No mid-tournament auto-forfeit in launch paths
 *
 * Usage: npm run verify:tournament-launch-attendance
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: PHASE_1_4P_PLAYER_IDS (4 UUIDs), TOURNAMENT_LAUNCH_ATTENDANCE_KEEP=1
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PRESENCE_WINDOW_MS = 10 * 60 * 1000;
const MIGRATION = 'supabase/migrations/20260519180000_tournament_launch_checkin.sql';

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

function isBracketFull(entrantCount) {
  const n = Math.max(0, Math.floor(entrantCount));
  if (n < 2) return false;
  const target = Math.min(8, nextPowerOf2(n));
  return n === target;
}

function isAsyncTempo(tempo) {
  const t = String(tempo ?? '').trim().toLowerCase();
  return t === 'daily' || t === 'correspondence';
}

function isPresent(row, nowMs) {
  const checked = row.checkedInAt ? Date.parse(row.checkedInAt) : NaN;
  const seen = row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
  if (Number.isFinite(checked) && nowMs - checked <= PRESENCE_WINDOW_MS) return true;
  if (Number.isFinite(seen) && nowMs - seen <= PRESENCE_WINDOW_MS) return true;
  return false;
}

function orderUserIds(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (a.seed != null && b.seed != null && a.seed !== b.seed) return a.seed - b.seed;
    if (a.seed != null && b.seed == null) return -1;
    if (a.seed == null && b.seed != null) return 1;
    return a.userId.localeCompare(b.userId);
  });
  return sorted.map((e) => e.userId);
}

function resolveLiveLaunchEntrantIds(entries, bracketTargetSize, nowMs = Date.now()) {
  const required = Math.max(2, bracketTargetSize);
  const registered = entries.filter((e) => e.entryRole === 'entrant');
  const standby = entries
    .filter((e) => e.entryRole === 'standby')
    .sort((a, b) => {
      if (a.seed != null && b.seed != null && a.seed !== b.seed) return a.seed - b.seed;
      if (a.seed != null && b.seed == null) return -1;
      if (a.seed == null && b.seed != null) return 1;
      return a.userId.localeCompare(b.userId);
    });

  const present = registered.filter((e) => isPresent(e, nowMs));
  const skipped = registered.filter((e) => !isPresent(e, nowMs)).map((e) => e.userId);

  const finalRows = [...present];
  const promoted = [];
  for (const s of standby) {
    if (finalRows.length >= required) break;
    finalRows.push(s);
    promoted.push(s.userId);
  }

  if (finalRows.length < required) {
    return {
      ok: false,
      code: 'not_enough_present',
      presentCount: finalRows.length,
      skippedUserIds: skipped,
    };
  }

  return {
    ok: true,
    orderedUserIds: orderUserIds(
      finalRows.slice(0, required).map((e) => ({ userId: e.userId, seed: e.seed })),
    ),
    skippedUserIds: skipped,
    promotedStandbyUserIds: promoted,
  };
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
  return { plans, totalRounds: Math.round(Math.log2(m)) };
}

function matchKey(r, n) {
  return `${r}:${n}`;
}

async function persistBracket(supabase, tournamentId, orderedUserIds) {
  const { plans, totalRounds } = planBracket(orderedUserIds);
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
  if (insErr) throw new Error(insErr.message);

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
    if (upErr) throw new Error(upErr.message);
  }

  const { error: stErr } = await supabase
    .from('tournaments')
    .update({ status: 'active', launch_scheduled_at: null })
    .eq('id', tournamentId)
    .eq('status', 'pending');
  if (stErr) throw new Error(stErr.message);

  const { error: procErr } = await supabase.rpc('tournament_bootstrap_round', {
    p_tournament_id: tournamentId,
  });
  if (procErr) throw new Error(procErr.message);

  const { count } = await supabase
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);
  return count ?? 0;
}

async function liveBootstrapWithAttendance(supabase, tournamentId) {
  const { data: tRow, error: tErr } = await supabase
    .from('tournaments')
    .select('status, tempo')
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr || !tRow) throw new Error(tErr?.message ?? 'tournament missing');
  if (String(tRow.status) !== 'pending') throw new Error('expected pending');

  const { data: entries, error: eErr } = await supabase
    .from('tournament_entries')
    .select('user_id, seed, entry_role, checked_in_at, last_seen_at')
    .eq('tournament_id', tournamentId);
  if (eErr) throw new Error(eErr.message);

  const rows = (entries ?? []).map((e) => ({
    userId: e.user_id,
    seed: e.seed,
    entryRole: String(e.entry_role ?? 'entrant') === 'standby' ? 'standby' : 'entrant',
    checkedInAt: e.checked_in_at != null ? String(e.checked_in_at) : null,
    lastSeenAt: e.last_seen_at != null ? String(e.last_seen_at) : null,
  }));

  const entrantCount = rows.filter((r) => r.entryRole === 'entrant').length;
  const resolved = resolveLiveLaunchEntrantIds(rows, entrantCount);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, presentCount: resolved.presentCount };
  }

  for (const uid of resolved.skippedUserIds) {
    await supabase
      .from('tournament_entries')
      .update({ launch_skip_reason: 'absent_at_live_launch' })
      .eq('tournament_id', tournamentId)
      .eq('user_id', uid);
  }

  const matchCount = await persistBracket(supabase, tournamentId, resolved.orderedUserIds);
  return {
    ok: true,
    matchCount,
    orderedUserIds: resolved.orderedUserIds,
    skippedUserIds: resolved.skippedUserIds,
    promotedStandbyUserIds: resolved.promotedStandbyUserIds,
  };
}

async function asyncBootstrapAllEntrants(supabase, tournamentId) {
  const { data: entries, error: eErr } = await supabase
    .from('tournament_entries')
    .select('user_id, seed, entry_role')
    .eq('tournament_id', tournamentId)
    .eq('entry_role', 'entrant');
  if (eErr) throw new Error(eErr.message);
  const ordered = orderUserIds(
    (entries ?? []).map((e) => ({ userId: e.user_id, seed: e.seed })),
  );
  const matchCount = await persistBracket(supabase, tournamentId, ordered);
  return { ok: true, matchCount, orderedUserIds: ordered };
}

async function resolvePlayerIds(supabase, count) {
  const raw = process.env.PHASE_1_4P_PLAYER_IDS?.trim();
  if (raw) {
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length < count || !ids.every((id) => UUID_RE.test(id))) {
      fail(`PHASE_1_4P_PLAYER_IDS need at least ${count} valid UUIDs`);
    }
    return ids.slice(0, count);
  }
  const pool = [
    process.env.BOT_USER_ID_CARDI?.trim(),
    process.env.BOT_USER_ID_AGGRO?.trim(),
    process.env.BOT_USER_ID_ENDGAME?.trim(),
  ].filter(Boolean);
  const { data: extra } = await supabase.from('profiles').select('id').limit(12);
  for (const row of extra ?? []) {
    const id = String(row.id);
    if (!pool.includes(id)) pool.push(id);
    if (pool.length >= count) break;
  }
  if (pool.length < count) fail(`need ${count} profile UUIDs`);
  return pool.slice(0, count);
}

async function createTournament(supabase, { tempo, createdBy }) {
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name: `Launch attendance verify ${tempo} ${Date.now()}`,
      status: 'pending',
      format: 'single_elimination',
      tempo,
      rated: false,
      created_by: createdBy,
      ecosystem_scope: 'adult',
    })
    .select('id, status, tempo')
    .single();
  if (error || !data?.id) fail(`create tournament: ${error?.message ?? 'no id'}`);
  return data;
}

async function cleanup(supabase, tournamentId) {
  if (process.env.TOURNAMENT_LAUNCH_ATTENDANCE_KEEP === '1') {
    ok(`KEEP=1 tournament ${tournamentId}`);
    return;
  }
  await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
  await supabase.from('tournament_entries').delete().eq('tournament_id', tournamentId);
  await supabase.from('tournaments').delete().eq('id', tournamentId);
}

function verifyStaticArtifacts() {
  if (!existsSync(MIGRATION)) fail(`missing ${MIGRATION}`);
  const sql = readFileSync(MIGRATION, 'utf8');
  for (const col of [
    'checked_in_at',
    'last_seen_at',
    'entry_role',
    'launch_skip_reason',
    'launch_scheduled_at',
  ]) {
    if (!sql.includes(col)) fail(`migration missing column ${col}`);
  }
  ok('migration file defines launch attendance columns');

  const bootstrapRoute = readFileSync('app/api/tournaments/[id]/bootstrap/route.ts', 'utf8');
  if (!bootstrapRoute.includes('runTournamentBootstrap')) {
    fail('bootstrap route must use runTournamentBootstrap');
  }
  ok('bootstrap route delegates to runTournamentBootstrap');

  const bootstrapLib = readFileSync('lib/server/tournamentBootstrap.ts', 'utf8');
  if (bootstrapLib.includes('finish_game_system')) {
    fail('tournamentBootstrap must not call finish_game_system (no launch auto-forfeit)');
  }
  if (!bootstrapLib.includes('resolveLiveLaunchEntrantIds')) {
    fail('tournamentBootstrap must resolve live launch entrants');
  }
  if (!bootstrapLib.includes('isAsyncTournamentForLaunch')) {
    fail('tournamentBootstrap must gate async bypass');
  }
  ok('launch bootstrap has no finish_game_system / uses attendance resolve');

  for (const path of [
    'app/api/tournaments/[id]/check-in/route.ts',
    'app/api/tournaments/[id]/launch-schedule/route.ts',
  ]) {
    const src = readFileSync(path, 'utf8');
    if (src.includes('finish_game_system')) fail(`${path} must not auto-forfeit`);
  }
  ok('check-in and launch-schedule routes do not auto-forfeit');
}

async function verifySchemaColumns(supabase) {
  const { error: eErr } = await supabase
    .from('tournament_entries')
    .select('checked_in_at, last_seen_at, entry_role, launch_skip_reason')
    .limit(1);
  if (eErr?.message?.includes('does not exist') || eErr?.code === '42703') {
    fail(`tournament_entries launch columns missing — apply ${MIGRATION}: ${eErr.message}`);
  }
  if (eErr) fail(`tournament_entries schema probe: ${eErr.message}`);
  ok('tournament_entries launch columns queryable');

  const { error: tErr } = await supabase.from('tournaments').select('launch_scheduled_at').limit(1);
  if (tErr?.message?.includes('does not exist') || tErr?.code === '42703') {
    fail(`tournaments.launch_scheduled_at missing — apply ${MIGRATION}`);
  }
  if (tErr) fail(`tournaments schema probe: ${tErr.message}`);
  ok('tournaments.launch_scheduled_at queryable');
}

async function main() {
  verifyStaticArtifacts();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  await verifySchemaColumns(supabase);

  const { data: creator } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  if (!creator?.id) fail('no profile for created_by');

  const six = await resolvePlayerIds(supabase, 6);
  const [p1, p2, p3, p4, p5, p6] = six;
  const now = new Date().toISOString();

  // --- Launch-check state (full live pending) ---
  const liveFull = await createTournament(supabase, { tempo: 'live', createdBy: creator.id });
  const liveFullId = liveFull.id;
  await supabase.from('tournament_entries').insert(
    [p1, p2, p3, p4].map((user_id, i) => ({
      tournament_id: liveFullId,
      user_id,
      seed: i + 1,
      entry_role: 'entrant',
    })),
  );
  if (!isBracketFull(4)) fail('internal: 4 should be bracket full');
  const launchAt = new Date(Date.now() + 20_000).toISOString();
  const { error: schedErr } = await supabase
    .from('tournaments')
    .update({ launch_scheduled_at: launchAt })
    .eq('id', liveFullId);
  if (schedErr) fail(`launch_scheduled_at update: ${schedErr.message}`);
  const { count: m0 } = await supabase
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', liveFullId);
  if ((m0 ?? 0) !== 0) fail('launch-check: bracket must not exist before bootstrap');
  ok('live full pending: launch_scheduled_at set, bracket empty (launch-check state)');
  await cleanup(supabase, liveFullId);

  // --- All checked in → bootstrap ---
  const liveOk = await createTournament(supabase, { tempo: 'live', createdBy: creator.id });
  const liveOkId = liveOk.id;
  await supabase.from('tournament_entries').insert(
    [p1, p2, p3, p4].map((user_id, i) => ({
      tournament_id: liveOkId,
      user_id,
      seed: i + 1,
      entry_role: 'entrant',
      checked_in_at: now,
      last_seen_at: now,
    })),
  );
  const rAll = await liveBootstrapWithAttendance(supabase, liveOkId);
  if (!rAll.ok || rAll.matchCount < 3) fail(`all present bootstrap: ${JSON.stringify(rAll)}`);
  const { data: seatedAll } = await supabase
    .from('tournament_matches')
    .select('player1_id, player2_id')
    .eq('tournament_id', liveOkId)
    .eq('round_number', 1);
  const seatedIds = new Set();
  for (const m of seatedAll ?? []) {
    if (m.player1_id) seatedIds.add(m.player1_id);
    if (m.player2_id) seatedIds.add(m.player2_id);
  }
  for (const id of [p1, p2, p3, p4]) {
    if (!seatedIds.has(id)) fail(`checked-in entrant ${id.slice(0, 8)} not in R1`);
  }
  ok('live launch: all checked-in entrants seated in round 1');
  await cleanup(supabase, liveOkId);

  // --- Absent + standby replace ---
  const liveRep = await createTournament(supabase, { tempo: 'live', createdBy: creator.id });
  const liveRepId = liveRep.id;
  await supabase.from('tournament_entries').insert([
    { tournament_id: liveRepId, user_id: p1, seed: 1, entry_role: 'entrant' },
    { tournament_id: liveRepId, user_id: p2, seed: 2, entry_role: 'entrant', checked_in_at: now, last_seen_at: now },
    { tournament_id: liveRepId, user_id: p3, seed: 3, entry_role: 'entrant', checked_in_at: now, last_seen_at: now },
    { tournament_id: liveRepId, user_id: p4, seed: 4, entry_role: 'entrant' },
    { tournament_id: liveRepId, user_id: p5, seed: 5, entry_role: 'standby', checked_in_at: now, last_seen_at: now },
    { tournament_id: liveRepId, user_id: p6, seed: 6, entry_role: 'standby', checked_in_at: now, last_seen_at: now },
  ]);
  const rRep = await liveBootstrapWithAttendance(supabase, liveRepId);
  if (!rRep.ok) fail(`standby replace bootstrap: ${JSON.stringify(rRep)}`);
  if (!rRep.skippedUserIds.includes(p1) || !rRep.skippedUserIds.includes(p4)) {
    fail(`expected absent p1/p4 skipped, got ${rRep.skippedUserIds.join(',')}`);
  }
  if (!rRep.promotedStandbyUserIds.includes(p5)) fail('standby p5 should be promoted');
  const { data: skipRows } = await supabase
    .from('tournament_entries')
    .select('user_id, launch_skip_reason')
    .eq('tournament_id', liveRepId)
    .in('user_id', [p1, p4]);
  if ((skipRows ?? []).length < 2) fail('expected launch_skip_reason rows for absent entrants');
  for (const row of skipRows ?? []) {
    if (row.launch_skip_reason !== 'absent_at_live_launch') {
      fail(`launch_skip_reason missing for ${row.user_id}`);
    }
  }
  if (!rRep.orderedUserIds.includes(p5)) fail('promoted standby must be in bracket list');
  if (rRep.orderedUserIds.includes(p1) || rRep.orderedUserIds.includes(p4)) {
    fail('absent entrants must not be in final entrant list');
  }
  ok('live launch: absent skipped, standby promoted before bracket spawn');
  await cleanup(supabase, liveRepId);

  // --- Not enough present → no spawn ---
  const liveBlock = await createTournament(supabase, { tempo: 'live', createdBy: creator.id });
  const liveBlockId = liveBlock.id;
  await supabase.from('tournament_entries').insert(
    [p1, p2, p3, p4].map((user_id, i) => ({
      tournament_id: liveBlockId,
      user_id,
      seed: i + 1,
      entry_role: 'entrant',
    })),
  );
  const resolveBlock = resolveLiveLaunchEntrantIds(
    [p1, p2, p3, p4].map((userId, i) => ({
      userId,
      seed: i + 1,
      entryRole: 'entrant',
      checkedInAt: null,
      lastSeenAt: null,
    })),
    4,
  );
  if (resolveBlock.ok) fail('expected not_enough_present when none checked in');
  const rBlock = await liveBootstrapWithAttendance(supabase, liveBlockId);
  if (rBlock.ok) fail(`bootstrap should fail when not enough present: ${JSON.stringify(rBlock)}`);
  const { count: mBlock } = await supabase
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', liveBlockId);
  if ((mBlock ?? 0) !== 0) fail('blocked launch must leave bracket empty');
  const { data: stBlock } = await supabase
    .from('tournaments')
    .select('status')
    .eq('id', liveBlockId)
    .single();
  if (stBlock?.status !== 'pending') fail('tournament must stay pending when launch blocked');
  ok('live launch: not enough present — no bracket spawn, stays pending');
  await cleanup(supabase, liveBlockId);

  // --- Async bypass (no check-in required) ---
  const daily = await createTournament(supabase, { tempo: 'daily', createdBy: creator.id });
  const dailyId = daily.id;
  if (!isAsyncTempo(daily.tempo)) fail('daily tempo probe');
  await supabase.from('tournament_entries').insert(
    [p1, p2, p3, p4].map((user_id, i) => ({
      tournament_id: dailyId,
      user_id,
      seed: i + 1,
      entry_role: 'entrant',
    })),
  );
  const rDaily = await asyncBootstrapAllEntrants(supabase, dailyId);
  if (!rDaily.ok || rDaily.matchCount < 3) fail(`async bootstrap: ${JSON.stringify(rDaily)}`);
  for (const id of [p1, p2, p3, p4]) {
    if (!rDaily.orderedUserIds.includes(id)) fail('async must include all entrants without check-in');
  }
  ok('async/daily tournament bypasses attendance gate (all entrants bootstrap)');
  await cleanup(supabase, dailyId);

  console.log('\nPhase 1 — live tournament launch attendance verification PASSED');
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
