/**
 * Stage 0 alpha readiness — operational verification runner (no new features).
 *
 * Usage:
 *   node scripts/stage-0-alpha-verification.mjs
 *   node scripts/stage-0-alpha-verification.mjs --skip-migration
 *   node scripts/stage-0-alpha-verification.mjs --only migration,bots,play-computer,ko
 *
 * Env: .env.local (Supabase, E2E creds, optional ACCL_BASE_URL for prod/staging HTTP checks)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const MIGRATION = '20260519200000_tournament_zero_move_rating_void.sql';

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

const argv = process.argv.slice(2);
const skipMigration = argv.includes('--skip-migration');
const onlyArg = argv.find((a) => a.startsWith('--only='));
const only = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim()))
  : null;

function runStep(key, label, cmd, extraEnv = {}) {
  if (only && !only.has(key)) return { key, label, ok: true, skipped: true };
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(cmd[0], cmd.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
  const ok = r.status === 0;
  if (!ok) console.error(`FAIL: ${label} (exit ${r.status ?? 'signal'})`);
  return { key, label, ok, skipped: false };
}

const results = [];

if (!skipMigration) {
  results.push(
    runStep('migration', `Migration check: ${MIGRATION}`, [
      'node',
      'scripts/apply-supabase-migration.mjs',
      '--check',
      MIGRATION,
    ]),
  );
  const check = results[results.length - 1];
  if (check.ok && !check.skipped) {
    console.log('Migration present — apply skipped (use apply-supabase-migration.mjs without --check to force)');
  } else if (!check.skipped) {
    results.push(
      runStep('migration-apply', `Migration apply: ${MIGRATION}`, [
        'node',
        'scripts/apply-supabase-migration.mjs',
        MIGRATION,
      ]),
    );
  }
} else {
  console.log('\n=== Migration (skipped via --skip-migration) ===');
}

results.push(
  runStep('bots', 'Play Computer bot profiles', ['npm', 'run', 'ensure:play-computer-bots']),
);

const baseUrl =
  process.env.ACCL_BASE_URL?.trim() ||
  process.env.VERCEL_URL?.trim()?.replace(/^\//, '') ||
  'https://accl-platform.vercel.app';
const prodBase = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

results.push(
  runStep('play-computer', `Play Computer smoke (${prodBase})`, [
    'node',
    'scripts/prod-play-computer-smoke.mjs',
  ], { ACCL_BASE_URL: prodBase }),
);

results.push(
  runStep('ko', '4-player KO verification', ['node', 'scripts/tournament-4p-ko-verification.mjs']),
);

const overlapSpec = 'tests/functional/stage0-free-play-overlap-pressure.spec.ts';
console.log('\n=== Free Play overlap (concurrent — required for Stage 0) ===');
console.log(`  npx playwright test ${overlapSpec}`);
if (!only || only.has('free-play')) {
  const hasTwo =
    Boolean(process.env.E2E_USER_EMAIL?.trim()) &&
    Boolean(process.env.E2E_USER_B_EMAIL?.trim());
  if (hasTwo) {
    results.push(
      runStep('free-play', 'Free Play concurrent overlap pressure', [
        'npx',
        'playwright',
        'test',
        overlapSpec,
        '--project=stage0-overlap',
      ]),
    );
  } else {
    console.log('SKIP: Free Play overlap (set E2E_USER_EMAIL + E2E_USER_B_EMAIL)');
    results.push({ key: 'free-play', label: 'Free Play overlap', ok: true, skipped: true });
  }
}

console.log('\n=== Stage 0 summary ===');
for (const r of results) {
  const status = r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${r.label}`);
}
const failed = results.some((r) => !r.skipped && !r.ok);
if (failed) {
  console.error('\nStage 0 verification incomplete — fix failures above.');
  process.exit(1);
}
console.log('\nStage 0 verification passed. Update docs/STAGE_0_ALPHA_SNAPSHOT.md with commit SHA and timestamps.');
