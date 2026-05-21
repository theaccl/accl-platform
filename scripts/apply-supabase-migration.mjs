/**
 * Apply one repo migration file via Supabase Management API (when CLI db push lacks DB password).
 *
 * Usage:
 *   node scripts/apply-supabase-migration.mjs 20260519200000_tournament_zero_move_rating_void.sql
 *   node scripts/apply-supabase-migration.mjs --check 20260519200000_tournament_zero_move_rating_void.sql
 *
 * Requires:
 *   SUPABASE_ACCESS_TOKEN (dashboard account token)
 *   Project ref: supabase/.temp/project-ref or SUPABASE_PROJECT_REF
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import fetch from 'cross-fetch';

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

const args = process.argv.slice(2);
const checkOnly = args[0] === '--check';
const fileArg = (checkOnly ? args[1] : args[0])?.trim();
if (!fileArg) {
  console.error('Usage: node scripts/apply-supabase-migration.mjs [--check] <migration-filename.sql>');
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const ref =
  process.env.SUPABASE_PROJECT_REF?.trim() ||
  (existsSync('supabase/.temp/project-ref')
    ? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
    : '');

if (!token) {
  console.error('FAIL: SUPABASE_ACCESS_TOKEN required (Supabase dashboard → Account → Access Tokens)');
  process.exit(1);
}
if (!ref) {
  console.error('FAIL: project ref missing (supabase/.temp/project-ref or SUPABASE_PROJECT_REF)');
  process.exit(1);
}

const migrationPath = join(process.cwd(), 'supabase', 'migrations', fileArg);
if (!existsSync(migrationPath)) {
  console.error(`FAIL: migration not found: ${migrationPath}`);
  process.exit(1);
}

const version = fileArg.replace(/\.sql$/i, '').split('_')[0];

async function runQuery(query, readOnly = false) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, read_only: readOnly }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function migrationApplied() {
  try {
    const rows = await runQuery(
      `select version::text from supabase_migrations.schema_migrations where version = '${version}' limit 1;`,
      true,
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    const def = await runQuery(
      `select pg_get_functiondef('public.apply_free_play_rating_update_core(uuid)'::regprocedure) as def;`,
      true,
    );
    const text = JSON.stringify(def);
    return text.includes('zero_move_void') || text.includes('abandoned_before_move');
  }
}

async function main() {
  if (checkOnly) {
    const ok = await migrationApplied();
    if (ok) {
      console.log(`OK: migration ${version} appears applied`);
      process.exit(0);
    }
    console.error(`FAIL: migration ${version} not detected on project ${ref}`);
    process.exit(1);
  }

  if (await migrationApplied()) {
    console.log(`OK: migration ${version} already applied — skipping`);
    process.exit(0);
  }

  const sql = readFileSync(migrationPath, 'utf8');
  console.log(`Applying ${fileArg} to project ${ref}…`);
  await runQuery(sql, false);
  const ok = await migrationApplied();
  if (!ok) {
    console.warn('WARN: apply succeeded but version row not verified — confirm in SQL editor');
  }
  console.log(`OK: applied ${fileArg}`);
}

main().catch((e) => {
  console.error(`FAIL: ${e.message}`);
  process.exit(1);
});
