/**
 * Verify zero-move rating void via service role (no Management API token).
 * Probes apply_free_play_rating_update_core behavior on a synthetic 0-move finished game.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
  global: { fetch: fetch },
});

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const { data: profs } = await supabase.from('profiles').select('id').limit(2);
if (!profs || profs.length < 2) fail('need at least two profiles');
const [whiteId, blackId] = profs.map((p) => p.id);
const now = new Date().toISOString();

const { data: game, error: insErr } = await supabase
  .from('games')
  .insert({
    white_player_id: whiteId,
    black_player_id: blackId,
    status: 'finished',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'white',
    result: 'white_win',
    end_reason: 'resign',
    source_type: 'challenge',
    play_context: 'free',
    mode: 'SKETCH',
    rated: true,
    tempo: 'live',
    finished_at: now,
    last_move_at: now,
  })
  .select('id')
  .single();

if (insErr || !game?.id) fail(`insert probe game: ${insErr?.message ?? 'unknown'}`);

const { data: out, error: rpcErr } = await supabase.rpc('apply_free_play_rating_update', {
  p_game_id: game.id,
});

await supabase.from('games').delete().eq('id', game.id);

if (rpcErr) fail(`rpc: ${rpcErr.message}`);

const applied = out?.applied;
const reason = String(out?.reason ?? '');
if (applied === false && (reason === 'zero_move_void' || reason.includes('zero_move'))) {
  console.log(`OK: migration behavior verified (reason=${reason})`);
  process.exit(0);
}

if (applied === false && reason === 'abandoned_before_move') {
  console.log('OK: migration behavior verified (abandoned_before_move void)');
  process.exit(0);
}

console.log(JSON.stringify(out, null, 2));
fail(`expected zero_move_void or abandoned void, got applied=${applied} reason=${reason}`);
