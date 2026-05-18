/**
 * Phase 1E: Real DB smoke after transactional move logs (Phase 1D).
 *
 * Usage (repo root):
 *   node scripts/phase-1e-transactional-move-log-smoke.mjs
 *   node scripts/phase-1e-transactional-move-log-smoke.mjs --skip-migration
 *
 * --skip-migration
 *   Skip Management API / auto-apply. Use when migration was applied manually in SQL Editor.
 *   Only probes p_move_log on apply_move_and_maybe_finish_system, then runs the smoke test.
 *
 * Requires .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   E2E_MODERATOR_EMAIL, E2E_MODERATOR_PASSWORD
 *   ACCL_BASE_URL (default http://127.0.0.1:3000) — Next.js dev/production must be running
 *
 * Optional: SUPABASE_ACCESS_TOKEN — only if auto-applying migration (no --skip-migration)
 * Optional: ACCL_ANALYSIS_QUEUE_SECRET — to process analysis job after resign
 * Optional: PHASE_1E_WHITE_PROFILE_ID, PHASE_1E_BLACK_PROFILE_ID — probe game seats (distinct UUIDs)
 * Optional: BOT_USER_ID_CARDI (or aggro/endgame) — used with E2E moderator id when profiles table is sparse
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const PROJECT_REF = 'nlptviibefbzisyqswuv';
const BASE_URL = process.env.ACCL_BASE_URL?.trim() || 'http://127.0.0.1:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim() || '';
const MOD_EMAIL = process.env.E2E_MODERATOR_EMAIL?.trim() || '';
const MOD_PASSWORD = process.env.E2E_MODERATOR_PASSWORD?.trim() || '';
const QUEUE_SECRET = process.env.ACCL_ANALYSIS_QUEUE_SECRET?.trim() || '';
const SKIP_MIGRATION = process.argv.includes('--skip-migration');

const MIGRATION_FILE = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260530140000_apply_move_transactional_move_log.sql',
);

const report = {
  skipMigration: SKIP_MIGRATION,
  migrationApplied: false,
  migrationApplyMethod: null,
  profileSeedRequired: null,
  profileCount: null,
  probeProfileSource: null,
  probeWhiteProfileId: null,
  probeBlackProfileId: null,
  rpcAcceptsMoveLog: null,
  rpcProbeError: null,
  gameId: null,
  pliesPlayed: 0,
  moveLogCount: 0,
  replayIntegrity: null,
  errors: [],
  analysisJob: null,
  botSettingsPresent: null,
  ratingLastUpdateHasBotConfig: null,
};

const PROFILE_SEED_INSTRUCTION = `Profile seed required for the RPC probe (needs two distinct public.profiles.id values).

Option A — set explicit probe seats in .env.local:
  PHASE_1E_WHITE_PROFILE_ID=<profiles.id uuid>
  PHASE_1E_BLACK_PROFILE_ID=<profiles.id uuid>

Option B — ensure at least two rows exist:
  select id from public.profiles limit 5;

Option C — use E2E moderator + a configured bot profile id:
  E2E_MODERATOR_EMAIL / E2E_MODERATOR_PASSWORD (sign-in user → white)
  BOT_USER_ID_CARDI=<profiles.id uuid> (or BOT_USER_ID_AGGRO / BOT_USER_ID_ENDGAME)

Then re-run with --skip-migration and ACCL_BASE_URL pointing at your dev server.`;

function fail(msg) {
  report.errors.push(msg);
  throw new Error(msg);
}

async function applyMigrationViaManagementApi() {
  if (!ACCESS_TOKEN) {
    return { ok: false, reason: 'SUPABASE_ACCESS_TOKEN not set' };
  }
  const sql = readFileSync(MIGRATION_FILE, 'utf8');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status}: ${typeof body === 'string' ? body.slice(0, 400) : JSON.stringify(body).slice(0, 400)}` };
  }
  return { ok: true, body };
}

function printProfileSeedRequired(resolution) {
  report.profileSeedRequired = 'profile_seed_required';
  report.profileCount = resolution.profileCount ?? null;
  report.rpcAcceptsMoveLog = null;
  report.rpcProbeError = null;
  console.error('profile_seed_required: cannot run RPC probe without two profile seats.');
  if (resolution.detail) console.error(resolution.detail);
  console.error('');
  console.error(PROFILE_SEED_INSTRUCTION);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}

async function profileExists(service, id) {
  const { data, error } = await service.from('profiles').select('id').eq('id', id).maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data?.id) return { ok: false, reason: `profile not found: ${id}` };
  return { ok: true };
}

/**
 * Resolves two distinct profile ids for the throwaway probe game (not the computer-game API path).
 */
async function resolveProbeProfilePair(service, opts = {}) {
  const whiteOverride = process.env.PHASE_1E_WHITE_PROFILE_ID?.trim() || '';
  const blackOverride = process.env.PHASE_1E_BLACK_PROFILE_ID?.trim() || '';
  const e2eUserId = opts.e2eUserId?.trim() || '';
  const botFromEnv =
    process.env.BOT_USER_ID_CARDI?.trim() ||
    process.env.BOT_USER_ID_AGGRO?.trim() ||
    process.env.BOT_USER_ID_ENDGAME?.trim() ||
    '';

  if (whiteOverride && blackOverride) {
    if (whiteOverride === blackOverride) {
      return {
        ok: false,
        code: 'profile_seed_required',
        profileCount: 2,
        detail: 'PHASE_1E_WHITE_PROFILE_ID and PHASE_1E_BLACK_PROFILE_ID must differ.',
      };
    }
    for (const id of [whiteOverride, blackOverride]) {
      const check = await profileExists(service, id);
      if (!check.ok) {
        return {
          ok: false,
          code: 'profile_seed_required',
          profileCount: null,
          detail: check.reason,
        };
      }
    }
    return {
      ok: true,
      whiteId: whiteOverride,
      blackId: blackOverride,
      source: 'env_phase_1e_overrides',
    };
  }

  if (whiteOverride || blackOverride) {
    return {
      ok: false,
      code: 'profile_seed_required',
      profileCount: whiteOverride && blackOverride ? 2 : 1,
      detail: 'Set both PHASE_1E_WHITE_PROFILE_ID and PHASE_1E_BLACK_PROFILE_ID, or neither.',
    };
  }

  const { data: profiles, error: profErr } = await service.from('profiles').select('id').limit(10);
  const ids = (profiles ?? []).map((p) => String(p.id ?? '').trim()).filter(Boolean);
  if (!profErr && ids.length >= 2) {
    return {
      ok: true,
      whiteId: ids[0],
      blackId: ids[1],
      source: 'profiles_table',
      profileCount: ids.length,
    };
  }

  if (e2eUserId && botFromEnv && e2eUserId !== botFromEnv) {
    const checks = await Promise.all([
      profileExists(service, e2eUserId),
      profileExists(service, botFromEnv),
    ]);
    if (checks[0].ok && checks[1].ok) {
      return {
        ok: true,
        whiteId: e2eUserId,
        blackId: botFromEnv,
        source: 'e2e_moderator_and_bot_env',
        profileCount: ids.length,
      };
    }
    return {
      ok: false,
      code: 'profile_seed_required',
      profileCount: ids.length,
      detail: [!checks[0].ok ? checks[0].reason : null, !checks[1].ok ? checks[1].reason : null]
        .filter(Boolean)
        .join('; '),
    };
  }

  return {
    ok: false,
    code: 'profile_seed_required',
    profileCount: ids.length,
    detail: profErr?.message ?? (ids.length === 0 ? 'public.profiles returned no rows.' : `only ${ids.length} profile(s) found.`),
  };
}

function classifyRpcProbeFailure(reason) {
  const msg = String(reason ?? '').toLowerCase();
  if (msg.includes('could not find the function') || msg.includes('schema cache')) {
    return 'rpc_signature_missing_p_move_log';
  }
  if (msg.includes('move_log_invalid_payload')) {
    return 'move_log_invalid_payload';
  }
  if (msg.includes('rpc succeeded but no move log')) {
    return 'p_move_log_ignored';
  }
  return 'rpc_probe_failed';
}

async function probeRpcMoveLogParam(service, { whiteId, blackId }) {
  const humanId = whiteId;
  const botId = blackId;
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const { data: game, error: insErr } = await service
    .from('games')
    .insert({
      white_player_id: humanId,
      black_player_id: botId,
      status: 'active',
      fen: startFen,
      turn: 'white',
      source_type: 'bot_game',
      play_context: 'free',
      mode: 'SKETCH',
      rated: false,
      tempo: 'live',
    })
    .select('id')
    .single();
  if (insErr || !game?.id) {
    return { ok: false, kind: 'rpc_probe_failed', reason: insErr?.message ?? 'insert game failed' };
  }

  const board = new Chess(startFen);
  const m = board.move({ from: 'e2', to: 'e4' });
  const nextFen = board.fen();

  const { error: rpcErr } = await service.rpc('apply_move_and_maybe_finish_system', {
    p_game_id: game.id,
    p_expected_fen: startFen,
    p_next_fen: nextFen,
    p_next_turn: 'black',
    p_last_move_at: new Date().toISOString(),
    p_move_deadline_at: null,
    p_white_clock_ms: null,
    p_black_clock_ms: null,
    p_promote_waiting_to_active: false,
    p_result: null,
    p_end_reason: null,
    p_move_log: {
      game_id: game.id,
      player_id: humanId,
      san: m.san,
      from_sq: m.from,
      to_sq: m.to,
      fen_before: startFen,
      fen_after: nextFen,
      move_duration_ms: 50,
    },
  });

  const { count } = await service
    .from('game_move_logs')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', game.id);

  await service.from('games').delete().eq('id', game.id);

  if (rpcErr) {
    const msg = String(rpcErr.message ?? '');
    return { ok: false, kind: classifyRpcProbeFailure(msg), reason: msg };
  }
  if ((count ?? 0) < 1) {
    return {
      ok: false,
      kind: 'p_move_log_ignored',
      reason: 'RPC succeeded but no move log row (p_move_log ignored?)',
    };
  }
  return { ok: true };
}

function fenBoardKey(fen) {
  const parts = String(fen ?? '').trim().split(/\s+/);
  return parts.length >= 3 ? parts.slice(0, 3).join(' ') : String(fen ?? '').trim();
}

function verifyReplayIntegrity(gameFinalFen, logs) {
  if (!logs?.length) {
    return { ok: false, code: 'no_logs', message: 'No logs' };
  }
  const startFen = logs[0].fen_before || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const board = new Chess(startFen);
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.fen_before && fenBoardKey(board.fen()) !== fenBoardKey(log.fen_before)) {
      return { ok: false, code: 'fen_chain_break', plyIndex: i };
    }
    const from = String(log.from_sq ?? '').toLowerCase();
    const to = String(log.to_sq ?? '').toLowerCase();
    const ok = board.move({ from, to });
    if (!ok) return { ok: false, code: 'illegal_replay_move', plyIndex: i };
    if (log.fen_after && fenBoardKey(board.fen()) !== fenBoardKey(log.fen_after)) {
      return { ok: false, code: 'fen_chain_break_after', plyIndex: i };
    }
  }
  if (fenBoardKey(board.fen()) !== fenBoardKey(gameFinalFen)) {
    return { ok: false, code: 'replay_fen_mismatch', expected: gameFinalFen, actual: board.fen() };
  }
  return { ok: true, plyCount: logs.length };
}

async function playComputerGameSmoke(token, userId, service) {
  const startRes = await fetch(`${BASE_URL}/api/bot/game/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ difficulty: 2, personalityStyle: 'balanced' }),
  });
  const startJson = await startRes.json();
  if (!startRes.ok || !startJson?.game?.id) {
    fail(`bot game start failed: ${startRes.status} ${JSON.stringify(startJson)}`);
  }
  const gameId = startJson.game.id;
  report.gameId = gameId;

  const { data: freshBotRow, error: freshBotErr } = await service
    .from('games')
    .select('bot_settings,rating_last_update,source_type')
    .eq('id', gameId)
    .single();
  if (freshBotErr) fail(`load new bot game row failed: ${freshBotErr.message}`);
  report.botSettingsPresent =
    freshBotRow?.bot_settings != null && typeof freshBotRow.bot_settings === 'object';
  report.ratingLastUpdateHasBotConfig =
    freshBotRow?.rating_last_update != null &&
    typeof freshBotRow.rating_last_update === 'object' &&
    Object.prototype.hasOwnProperty.call(freshBotRow.rating_last_update, 'accl_bot_v1');
  if (!report.botSettingsPresent) {
    fail('new bot game missing bot_settings (apply Phase 1H migration?)');
  }
  if (report.ratingLastUpdateHasBotConfig) {
    fail('new bot game still stores accl_bot_v1 in rating_last_update');
  }

  let { data: gameRow } = await service.from('games').select('*').eq('id', gameId).single();
  const humanMoves = ['e2e4', 'd2d4', 'g1f3', 'c2c4'];
  let plies = 0;

  for (const uci of humanMoves) {
    if (String(gameRow?.status ?? '') === 'finished') break;
    if (String(gameRow?.turn ?? '') !== 'white') {
      report.errors.push(`stopped: not white turn after ${plies} plies`);
      break;
    }
    const fenBefore = String(gameRow.fen ?? '').trim();
    const board = new Chess(fenBefore);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const moved = board.move({ from, to });
    if (!moved) {
      report.errors.push(`illegal human move ${uci} at ply ${plies}`);
      break;
    }

    const submitRes = await fetch(`${BASE_URL}/api/game/submit-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        gameId,
        fenBefore,
        move: {
          san: moved.san,
          from_sq: moved.from,
          to_sq: moved.to,
          move_duration_ms: 400,
        },
      }),
    });
    const submitJson = await submitRes.json();
    if (!submitRes.ok) {
      fail(`submit-move failed ply ${plies}: ${submitRes.status} ${JSON.stringify(submitJson)}`);
    }
    if (submitJson.move_log_failed) {
      fail(`move_log_failed at ply ${plies}: ${JSON.stringify(submitJson)}`);
    }
    if (submitJson.bot_move_applied === false && String(gameRow?.source_type) === 'bot_game') {
      fail(`bot did not reply at ply ${plies}: ${JSON.stringify(submitJson)}`);
    }
    plies += 1;
    if (submitJson.bot_move_applied) plies += 1;
    gameRow = submitJson.row;
    report.pliesPlayed = plies;
    if (plies >= 4) break;
  }

  const { data: logs } = await service
    .from('game_move_logs')
    .select('san,from_sq,to_sq,fen_before,fen_after,created_at,player_id')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true });

  report.moveLogCount = logs?.length ?? 0;
  report.replayIntegrity = verifyReplayIntegrity(String(gameRow?.fen ?? ''), logs ?? []);

  if (report.moveLogCount < 4) {
    fail(`expected at least 4 move logs, got ${report.moveLogCount}`);
  }
  if (!report.replayIntegrity.ok) {
    fail(`replay integrity failed: ${JSON.stringify(report.replayIntegrity)}`);
  }

  if (String(gameRow?.status ?? '') !== 'finished') {
    const resignResult =
      gameRow?.white_player_id === userId ? 'black_win' : 'white_win';
    const { data: finished, error: finErr } = await service.rpc('finish_game_system', {
      p_game_id: gameId,
      p_result: resignResult,
      p_end_reason: 'resign',
    });
    if (finErr) fail(`finish_game_system failed: ${finErr.message}`);
    gameRow = finished;
  }

  const intake = await service.rpc('get_finished_game_analysis_intake', { p_game_id: gameId });
  if (intake.error) {
    report.errors.push(`intake rpc error: ${intake.error.message}`);
  }

  const { data: jobId, error: enqErr } = await service.rpc('enqueue_finished_game_analysis_job', {
    p_game_id: gameId,
    p_correlation_id: 'phase-1e-smoke',
  });
  if (enqErr) {
    report.analysisJob = { error: enqErr.message };
  } else {
    report.analysisJob = { jobId, status: 'queued' };
    if (QUEUE_SECRET) {
      try {
        const proc = await fetch(`${BASE_URL}/api/internal/analysis-queue/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-accl-analysis-queue-secret': QUEUE_SECRET,
          },
          body: JSON.stringify({ batch: 2 }),
        });
        const procJson = await proc.json().catch(() => ({}));
        const { data: jobRow } = await service
          .from('finished_game_analysis_jobs')
          .select('status')
          .eq('game_id', gameId)
          .maybeSingle();
        report.analysisJob = { jobId, processOk: proc.ok, status: jobRow?.status ?? null, procJson };
      } catch (e) {
        report.analysisJob = { jobId, processError: String(e) };
      }
    }
  }

  return { gameRow, logs };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    console.error('Missing Supabase URL/keys');
    process.exitCode = 1;
    return;
  }
  if (!MOD_EMAIL || !MOD_PASSWORD) {
    console.error('Missing E2E_MODERATOR_EMAIL / E2E_MODERATOR_PASSWORD');
    process.exitCode = 1;
    return;
  }

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

  if (SKIP_MIGRATION) {
    console.log('--- Phase 1E: migration apply skipped (--skip-migration) ---');
    report.migrationApplyMethod = 'skipped_manual_already_applied';
  } else {
    console.log('--- Phase 1E: apply migration ---');
    const mig = await applyMigrationViaManagementApi();
    if (mig.ok) {
      report.migrationApplied = true;
      report.migrationApplyMethod = 'management_api';
      console.log('Migration applied via Management API.');
    } else {
      console.warn('Migration apply skipped/failed:', mig.reason);
      console.log('Probing whether migration is already applied...');
    }
  }

  console.log('--- Phase 1E: resolve probe profile seats ---');
  let seats = await resolveProbeProfilePair(service);
  let cachedSignIn = null;
  if (!seats.ok) {
    cachedSignIn = await auth.auth.signInWithPassword({ email: MOD_EMAIL, password: MOD_PASSWORD });
    if (!cachedSignIn.error && cachedSignIn.data.user?.id) {
      seats = await resolveProbeProfilePair(service, { e2eUserId: cachedSignIn.data.user.id });
    }
  }
  if (!seats.ok) {
    printProfileSeedRequired(seats);
    return;
  }
  report.probeProfileSource = seats.source;
  report.probeWhiteProfileId = seats.whiteId;
  report.probeBlackProfileId = seats.blackId;
  report.profileCount = seats.profileCount ?? 2;
  console.log(`Probe seats: white=${seats.whiteId} black=${seats.blackId} (${seats.source})`);

  console.log('--- Phase 1E: probe p_move_log RPC ---');
  const probe = await probeRpcMoveLogParam(service, {
    whiteId: seats.whiteId,
    blackId: seats.blackId,
  });
  if (!probe.ok) {
    report.rpcAcceptsMoveLog = false;
    report.rpcProbeError = probe.kind ?? 'rpc_probe_failed';
    console.error(`RPC probe failed (${probe.kind}):`, probe.reason);
    if (probe.kind === 'rpc_signature_missing_p_move_log') {
      console.error(
        'Apply supabase/migrations/20260530140000_apply_move_transactional_move_log.sql in SQL Editor, then re-run.',
      );
    }
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }
  report.rpcAcceptsMoveLog = true;
  report.rpcProbeError = null;
  report.migrationApplied = true;
  if (SKIP_MIGRATION) {
    report.migrationApplyMethod = 'manual_sql_editor';
  } else if (!report.migrationApplyMethod) {
    report.migrationApplyMethod = 'already_applied_or_applied_now';
  }
  console.log('RPC p_move_log probe OK.');

  console.log('--- Phase 1E: computer game smoke (API) ---');
  try {
    const health = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) fail(`ACCL_BASE_URL not healthy: ${BASE_URL}`);
  } catch (e) {
    fail(`ACCL_BASE_URL unreachable (${BASE_URL}): ${e}`);
  }

  const signin =
    cachedSignIn?.data?.session?.access_token
      ? cachedSignIn
      : await auth.auth.signInWithPassword({ email: MOD_EMAIL, password: MOD_PASSWORD });
  if (signin.error || !signin.data.session?.access_token) {
    fail(`auth failed: ${signin.error?.message ?? 'no token'}`);
  }
  const token = signin.data.session.access_token;
  const userId = signin.data.user.id;

  await playComputerGameSmoke(token, userId, service);
  console.log('Smoke completed successfully.');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
