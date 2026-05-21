/**
 * Production Play Computer smoke — POST /api/bot/game/start for each personality.
 * Usage: ACCL_BASE_URL=https://accl-platform.vercel.app node scripts/prod-play-computer-smoke.mjs
 * Requires E2E_MODERATOR_EMAIL + E2E_MODERATOR_PASSWORD in .env.local (or env).
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = (process.env.ACCL_BASE_URL ?? 'https://accl-platform.vercel.app').replace(/\/$/, '');
const PERSONALITIES = ['balanced', 'aggressive', 'defensive', 'chaos'];

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.E2E_MODERATOR_EMAIL?.trim();
const password = process.env.E2E_MODERATOR_PASSWORD?.trim();

const botIds = new Set(
  [
    process.env.BOT_USER_ID_CARDI,
    process.env.BOT_USER_ID_AGGRO,
    process.env.BOT_USER_ID_ENDGAME,
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
  ]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean),
);

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

if (!url || !anon) fail('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY required');
if (!email || !password) fail('E2E_MODERATOR_EMAIL / E2E_MODERATOR_PASSWORD required');

const auth = createClient(url, anon, { auth: { persistSession: false } });
const serviceClient = service
  ? createClient(url, service, { auth: { persistSession: false } })
  : null;

const { data: signIn, error: signErr } = await auth.auth.signInWithPassword({ email, password });
if (signErr || !signIn.session?.access_token) {
  fail(`sign-in failed: ${signErr?.message ?? 'no session'}`);
}
const token = signIn.session.access_token;
const humanId = signIn.user.id;
console.log(`OK: signed in (${email}) user=${humanId.slice(0, 8)}…`);

const health = await fetch(`${BASE_URL}/api/health`);
if (!health.ok) fail(`/api/health ${health.status}`);
console.log(`OK: ${BASE_URL}/api/health`);

const results = [];

for (const personalityStyle of PERSONALITIES) {
  const res = await fetch(`${BASE_URL}/api/bot/game/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ difficulty: 3, personalityStyle, liveTimeControl: '5m' }),
  });
  const body = await res.json().catch(() => ({}));
  const entry = {
    personalityStyle,
    status: res.status,
    ok: res.ok,
    gameId: body?.game?.id ?? null,
    blackPlayerId: body?.game?.black_player_id ?? null,
    whitePlayerId: body?.game?.white_player_id ?? null,
    sourceType: body?.game?.source_type ?? null,
    error: body?.error ?? null,
    category: body?.category ?? null,
    key: body?.key ?? null,
    detail: body?.detail ?? null,
    bot: body?.bot ?? null,
  };
  results.push(entry);

  if (!res.ok) {
    console.log(JSON.stringify(entry, null, 2));
    fail(`${personalityStyle}: HTTP ${res.status}`);
  }
  if (!entry.gameId) fail(`${personalityStyle}: missing game.id`);
  if (entry.whitePlayerId !== humanId) fail(`${personalityStyle}: white is not human`);
  if (!entry.blackPlayerId || !botIds.has(entry.blackPlayerId)) {
    fail(`${personalityStyle}: black is not a known bot id (${entry.blackPlayerId})`);
  }
  if (entry.sourceType !== 'bot_game') fail(`${personalityStyle}: source_type ${entry.sourceType}`);

  if (serviceClient) {
    const { data: row, error: rowErr } = await serviceClient
      .from('games')
      .select('id,status,fen,turn,black_player_id,white_player_id,source_type,bot_settings')
      .eq('id', entry.gameId)
      .maybeSingle();
    if (rowErr || !row) fail(`${personalityStyle}: game row missing`);
    if (row.status !== 'active') fail(`${personalityStyle}: status ${row.status}`);
    if (!row.bot_settings || row.bot_settings.version !== 'accl_bot_v1') {
      fail(`${personalityStyle}: bot_settings missing or wrong version`);
    }
  }

  console.log(
    `OK: ${personalityStyle} → game ${entry.gameId.slice(0, 8)}… bot=${entry.bot} black=${entry.blackPlayerId.slice(0, 8)}…`,
  );
}

console.log('\nAll Play Computer production smokes passed.');
console.log(JSON.stringify({ baseUrl: BASE_URL, results }, null, 2));
