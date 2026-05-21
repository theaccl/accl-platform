/**
 * Ensures Play Computer bot profile rows exist for configured (or default) bot UUIDs.
 * Does not touch async bot queue, bot_move_jobs, or tournament bots.
 *
 * Usage:
 *   node scripts/ensure-play-computer-bot-profiles.mjs
 *   node scripts/ensure-play-computer-bot-profiles.mjs --dry-run
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or E2E_* equivalents).
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');

const BOT_SEATS = [
  { name: 'Cardi Bot', envKey: 'BOT_USER_ID_CARDI', defaultId: '10000000-0000-0000-0000-000000000001', username: 'cardi-bot' },
  { name: 'Aggro Bot', envKey: 'BOT_USER_ID_AGGRO', defaultId: '10000000-0000-0000-0000-000000000002', username: 'aggro-bot' },
  { name: 'Endgame Bot', envKey: 'BOT_USER_ID_ENDGAME', defaultId: '10000000-0000-0000-0000-000000000003', username: 'endgame-bot' },
];

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

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '').trim();
const serviceKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? ''
).trim();

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or E2E_* equivalents) required');
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const envSet = BOT_SEATS.map((b) => Boolean(process.env[b.envKey]?.trim()));
if (envSet.some(Boolean) && !envSet.every(Boolean)) {
  fail('Partial BOT_USER_ID_* — set all three distinct UUIDs or clear all three (defaults apply)');
}

const ids = BOT_SEATS.map((b) => process.env[b.envKey]?.trim() || b.defaultId);
if (new Set(ids).size !== 3) fail('Bot UUIDs must be distinct');

console.log(`Play Computer bot profile audit (${DRY_RUN ? 'dry-run' : 'apply'})`);
console.log(`Supabase: ${url}`);

let ok = 0;
let created = 0;
let missingAuth = 0;

for (let i = 0; i < BOT_SEATS.length; i++) {
  const seat = BOT_SEATS[i];
  const id = ids[i];
  const { data: profile, error: profErr } = await supabase.from('profiles').select('id,username').eq('id', id).maybeSingle();
  if (profErr) fail(`${seat.name}: profile lookup — ${profErr.message}`);

  const admin = await supabase.auth.admin.getUserById(id);
  const hasAuth = !admin.error && Boolean(admin.data?.user?.id);

  if (profile?.id) {
    console.log(`OK: ${seat.name} profile ${id.slice(0, 8)}… (${profile.username ?? 'no username'})`);
    ok++;
    if (!hasAuth) {
      console.warn(`WARN: ${seat.name} — profile exists but auth.users row missing (create auth user ${id} in Supabase)`);
      missingAuth++;
    }
    continue;
  }

  if (!hasAuth) {
    console.warn(`WARN: ${seat.name} — no auth.users row for ${id}; profile insert may fail RLS/FK`);
    missingAuth++;
  }

  if (DRY_RUN) {
    console.log(`DRY: would insert profile ${seat.username} → ${id}`);
    created++;
    continue;
  }

  const { error: insErr } = await supabase.from('profiles').insert({
    id,
    username: seat.username,
    games_played: 0,
    current_streak: 0,
    highest_streak: 0,
  });
  if (insErr) fail(`${seat.name}: insert profile — ${insErr.message}`);
  console.log(`CREATED: ${seat.name} profile ${seat.username} → ${id}`);
  created++;
}

console.log(`\nDone. existing=${ok} created=${created} auth_warnings=${missingAuth}`);
if (missingAuth > 0) {
  console.log('Auth users for bot UUIDs must exist in production when using custom BOT_USER_ID_* env vars.');
}
