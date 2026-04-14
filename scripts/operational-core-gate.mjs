import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) {
  const lines = readFileSync('.env.local', 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const BASE_URL = process.env.ACCL_BASE_URL?.trim() || 'http://127.0.0.1:3000';
const QUEUE_SECRET = process.env.ACCL_ANALYSIS_QUEUE_SECRET?.trim() || '';
const SUPABASE_URL = process.env.E2E_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const SERVICE_KEY =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
const MOD_EMAIL = process.env.E2E_MODERATOR_EMAIL?.trim() || '';
const MOD_PASSWORD = process.env.E2E_MODERATOR_PASSWORD?.trim() || '';

function fail(msg) {
  throw new Error(msg);
}
function ok(msg) {
  console.log(`PASS: ${msg}`);
}
function requireEnv(name, value) {
  if (!value) fail(`missing env: ${name}`);
}

async function main() {
  requireEnv('SUPABASE_URL', SUPABASE_URL);
  requireEnv('SERVICE_KEY', SERVICE_KEY);
  requireEnv('ANON_KEY', ANON_KEY);
  requireEnv('E2E_MODERATOR_EMAIL', MOD_EMAIL);
  requireEnv('E2E_MODERATOR_PASSWORD', MOD_PASSWORD);
  requireEnv('ACCL_ANALYSIS_QUEUE_SECRET', QUEUE_SECRET);

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const signin = await auth.auth.signInWithPassword({ email: MOD_EMAIL, password: MOD_PASSWORD });
  if (signin.error || !signin.data.session?.access_token || !signin.data.user?.id) {
    fail(`auth signin failed: ${signin.error?.message ?? 'unknown'}`);
  }
  const token = signin.data.session.access_token;
  const userId = signin.data.user.id;

  // 1) tournament enforcement + fingerprint
  const tgame = await service
    .from('games')
    .select('id,fen,status,tournament_id')
    .not('tournament_id', 'is', null)
    .eq('status', 'finished')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!tgame.data?.id) fail('no finished tournament game found for enforcement proof');
  const tid = tgame.data.id;
  const illegalFen = await service.from('games').update({ fen: tgame.data.fen + ' ' }).eq('id', tid).select('id').single();
  if (!illegalFen.error || !/immutable/i.test(illegalFen.error.message)) {
    fail(`tournament immutable check failed: ${illegalFen.error?.message ?? 'mutation unexpectedly succeeded'}`);
  }
  const reopen = await service.from('games').update({ status: 'active' }).eq('id', tid).select('id').single();
  if (!reopen.error || !/cannot reopen/i.test(reopen.error.message)) {
    fail(`tournament reopen block failed: ${reopen.error?.message ?? 'reopen unexpectedly succeeded'}`);
  }
  const fp = await service
    .from('protected_position_fingerprints')
    .select('game_id')
    .eq('game_id', tid)
    .limit(1)
    .maybeSingle();
  if (!fp.data?.game_id) fail('tournament fingerprint wall evidence missing');
  ok('tournament enforcement + fingerprint wall');

  // 2) submit-move contract + optimistic conflict
  const opponent = 'c54aaefb-7b5f-4120-a00b-faa976ecd561';
  const created = await service
    .from('games')
    .insert({
      white_player_id: userId,
      black_player_id: opponent,
      status: 'active',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      source_type: 'challenge',
      play_context: 'free',
      mode: 'SKETCH',
      rated: false,
      tempo: 'live',
    })
    .select('id')
    .single();
  if (created.error || !created.data?.id) fail(`create test game failed: ${created.error?.message ?? 'unknown'}`);
  const gid = created.data.id;

  const moveBody = {
    gameId: gid,
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    move: { san: 'e4', from_sq: 'e2', to_sq: 'e4', move_duration_ms: 1200 },
  };
  const submit = await fetch(`${BASE_URL}/api/game/submit-move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(moveBody),
  });
  const submitJson = await submit.json();
  if (!submit.ok || !submitJson?.ok) fail(`submit move failed: ${JSON.stringify(submitJson)}`);

  const logs = await service.from('game_move_logs').select('id', { count: 'exact', head: true }).eq('game_id', gid);
  if ((logs.count ?? 0) < 1) fail('submit-move did not write move log');

  const outOfTurn = await fetch(`${BASE_URL}/api/game/submit-move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...moveBody, fenBefore: '8/8/8/8/8/8/8/8 w - - 0 1' }),
  });
  const outOfTurnJson = await outOfTurn.json();
  if (
    outOfTurn.status !== 409 ||
    outOfTurnJson?.error !== 'invalid_move' ||
    !/not your turn/i.test(String(outOfTurnJson?.message ?? ''))
  ) {
    fail(`out-of-turn rejection invalid: status=${outOfTurn.status} body=${JSON.stringify(outOfTurnJson)}`);
  }

  const conflictGame = await service
    .from('games')
    .insert({
      white_player_id: userId,
      black_player_id: opponent,
      status: 'active',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      source_type: 'challenge',
      play_context: 'free',
      mode: 'SKETCH',
      rated: false,
      tempo: 'live',
    })
    .select('id')
    .single();
  if (conflictGame.error || !conflictGame.data?.id) {
    fail(`create optimistic-conflict game failed: ${conflictGame.error?.message ?? 'unknown'}`);
  }

  const badFen = await fetch(`${BASE_URL}/api/game/submit-move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...moveBody, gameId: conflictGame.data.id, fenBefore: '8/8/8/8/8/8/8/8 w - - 0 1' }),
  });
  const badJson = await badFen.json();
  if (badFen.status !== 409 || badJson?.error?.code !== 'optimistic_state_conflict') {
    fail(`optimistic conflict payload invalid: status=${badFen.status} body=${JSON.stringify(badJson)}`);
  }
  ok('submit-move authoritative path + out-of-turn + normalized optimistic conflict');

  // 3) bot auto-response proof (start + human ply + bot ply)
  const botStart = await fetch(`${BASE_URL}/api/bot/game/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bot: 'Cardi Bot' }),
  });
  const botStartJson = await botStart.json();
  if (!botStart.ok || !botStartJson?.game?.id) fail(`bot start failed: ${JSON.stringify(botStartJson)}`);
  const botGameId = botStartJson.game.id;
  const botMove = await fetch(`${BASE_URL}/api/game/submit-move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      gameId: botGameId,
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      move: { san: 'e4', from_sq: 'e2', to_sq: 'e4', move_duration_ms: 800 },
    }),
  });
  const botMoveJson = await botMove.json();
  if (!botMove.ok || !botMoveJson?.ok) fail(`bot game submit failed: ${JSON.stringify(botMoveJson)}`);
  const botLogs = await service
    .from('game_move_logs')
    .select('player_id,san')
    .eq('game_id', botGameId)
    .order('created_at', { ascending: true });
  if (!botLogs.data || botLogs.data.length < 2) fail('bot auto-response ply missing from move logs');
  ok('bot start + human ply + auto-response ply');

  // 4) queue analysis + short-game insufficiency metadata
  const now = new Date().toISOString();
  const shortGame = await service
    .from('games')
    .insert({
      white_player_id: userId,
      black_player_id: opponent,
      status: 'finished',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      turn: 'black',
      source_type: 'challenge',
      play_context: 'free',
      mode: 'SKETCH',
      rated: false,
      tempo: 'live',
      result: 'draw',
      end_reason: 'draw_agreement',
      finished_at: now,
      last_move_at: now,
    })
    .select('id')
    .single();
  if (shortGame.error || !shortGame.data?.id) fail(`create short finished game failed: ${shortGame.error?.message}`);
  await service.from('game_move_logs').insert({
    game_id: shortGame.data.id,
    player_id: userId,
    san: 'e4',
    from_sq: 'e2',
    to_sq: 'e4',
    fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    move_duration_ms: 300,
  });

  const enq = await service.rpc('enqueue_finished_game_analysis_job', { p_game_id: shortGame.data.id });
  if (enq.error || !enq.data) fail(`enqueue failed: ${enq.error?.message ?? 'unknown'}`);
  const processRes = await fetch(`${BASE_URL}/api/internal/analysis-queue/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-accl-analysis-queue-secret': QUEUE_SECRET },
    body: JSON.stringify({ batch: 3 }),
  });
  const processJson = await processRes.json();
  if (!processRes.ok) fail(`queue process endpoint failed: ${JSON.stringify(processJson)}`);

  const job = await service
    .from('finished_game_analysis_jobs')
    .select('status')
    .eq('id', enq.data)
    .maybeSingle();
  if (job.data?.status !== 'completed') fail(`analysis job not completed: ${JSON.stringify(job.data)}`);
  const eArtifact = await service
    .from('finished_game_analysis_artifacts')
    .select('payload')
    .eq('job_id', enq.data)
    .eq('artifact_type', 'engine_structured')
    .maybeSingle();
  const meta = eArtifact.data?.payload?.engine?.analysisMeta;
  if (!meta || !['insufficient_move_count', 'insufficient_position_depth', 'full'].includes(meta.completeness)) {
    fail(`missing/invalid analysisMeta: ${JSON.stringify(eArtifact.data)}`);
  }
  ok('queue analysis completion + engine insufficiency metadata');

  // 5) trainer real-data + active tournament leakage guard proof
  const profile = await service.from('player_pattern_profiles').select('user_id').eq('user_id', userId).maybeSingle();
  const positions = await service
    .from('trainer_generated_positions')
    .select('source_game_id,status')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .limit(20);
  if (!profile.data?.user_id) fail('trainer profile row missing');
  if (!positions.data || positions.data.length === 0) fail('trainer generated positions missing');
  const srcIds = [...new Set(positions.data.map((p) => p.source_game_id).filter(Boolean))];
  const srcGames = srcIds.length
    ? await service.from('games').select('id,status,tournament_id').in('id', srcIds)
    : { data: [] };
  const activeTournamentLeak = (srcGames.data || []).filter((g) => g.tournament_id && g.status !== 'finished');
  if (activeTournamentLeak.length > 0) {
    fail(`trainer leakage detected from active tournament games: ${JSON.stringify(activeTournamentLeak)}`);
  }
  ok('trainer real-data path + no active tournament leakage');

  // 6) migration parity check
  const migrationOutput = execSync('npx supabase migration list --linked', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const required = ['20260401090000', '20260401091000', '20260426120000', '20260426123000'];
  for (const version of required) {
    if (!migrationOutput.includes(`${version} | ${version}`)) {
      fail(`migration parity missing required version ${version}`);
    }
  }
  ok('migration parity check');

  console.log('PASS: operational core regression gate complete');
}

main().catch((err) => {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
