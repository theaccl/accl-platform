#!/usr/bin/env node
/**
 * Idempotent backfill of player_rating_history_ledger from finished rated games.
 * Source: games.rating_last_update only when before/after/delta are real.
 *
 * Usage:
 *   node scripts/backfill-rating-history-ledger.mjs [--dry-run] [--limit N]
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or .env.local).
 * Never deletes rows or mutates games.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvLocal() {
  const path = join(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10)) : null;

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const P1_MAP = {
  free_bullet: 'free_bullet',
  free_blitz: 'free_blitz',
  free_rapid: 'free_rapid',
  free_day: 'free_day',
  tournament_unified: 'tournament',
};

const BADGE_TO_TRACK = {
  bullet_1_0: 'free_bullet_1_0',
  bullet_1_1: 'free_bullet_1_1',
  bullet_2_0: 'free_bullet_2_0',
  bullet_2_1: 'free_bullet_2_1',
  blitz_3_0: 'free_blitz_3_0',
  blitz_3_2: 'free_blitz_3_2',
  blitz_5_0: 'free_blitz_5_0',
  blitz_5_5: 'free_blitz_5_5',
  rapid_10_0: 'free_rapid_10_0',
  rapid_15_0: 'free_rapid_15_0',
  rapid_20_0: 'free_rapid_20_0',
  rapid_30_0: 'free_rapid_30_0',
  rapid_60_0: 'free_rapid_60_0',
  daily_1_day: 'free_daily_1d',
  daily_2_day: 'free_daily_2d',
  daily_3_day: 'free_daily_3d',
  daily_5_day: 'free_daily_5d',
  daily_7_day: 'free_daily_7d',
};

const MODE_MAP = {
  free_bullet: 'bullet',
  free_blitz: 'blitz',
  free_rapid: 'rapid',
  free_day: 'daily',
};

function parseSide(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const before = raw.before;
  const after = raw.after;
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  const delta = typeof raw.delta === 'number' ? raw.delta : after - before;
  return { before, after, delta };
}

function resultForPlayer(result, playerId, whiteId, blackId) {
  if (result === 'draw' || result === '1/2-1/2') return 'draw';
  if (result === 'white_win') return playerId === whiteId ? 'win' : 'loss';
  if (result === 'black_win') return playerId === blackId ? 'win' : 'loss';
  return 'unknown';
}

function mapBadgeVisual(v) {
  if (v === 'upgraded') return 'shiny';
  if (v === 'downgraded') return 'downgraded';
  if (v === 'normal') return 'normal';
  return null;
}

function mapBadgeEvent(e) {
  const m = {
    demotion_armed: 'downgrade_armed',
    demotion_confirmed: 'downgrade_confirmed',
    demotion_pressure_cleared: 'recovered_to_normal',
    downgrade_repaired: 'recovered_to_normal',
    promotion_upgrade: 'upgrade_confirmed',
    streak_upgrade: 'shiny_earned',
    upgrade_lost_on_defeat: 'shiny_lost',
    none: 'none',
  };
  return m[e] ?? null;
}

function rowsForGame(g) {
  const upd = g.rating_last_update;
  if (!upd || typeof upd !== 'object' || upd.applied !== true) return [];
  const p1 = upd.p1_bucket;
  const modeTrack = P1_MAP[p1];
  if (!modeTrack) return [];

  const eco = g.play_context === 'tournament' ? 'tournament' : 'free';
  const occurred = g.finished_at ?? g.created_at;
  if (!occurred) return [];

  const out = [];
  const players = [
    { id: g.white_player_id, side: upd.p1_white ?? upd.white, opp: g.black_player_id },
    { id: g.black_player_id, side: upd.p1_black ?? upd.black, opp: g.white_player_id },
  ];

  for (const { id, side, opp } of players) {
    if (!id) continue;
    const snap = parseSide(side);
    if (snap) {
      out.push({
        player_id: id,
        rating_track_id: modeTrack,
        ecosystem: eco,
        rating_scope: 'mode',
        mode: MODE_MAP[p1] ?? null,
        time_control: g.live_time_control,
        badge_track_key: null,
        event_type: 'backfill',
        game_id: g.id,
        opponent_id: opp,
        result: resultForPlayer(g.result, id, g.white_player_id, g.black_player_id),
        rating_before: snap.before,
        rating_after: snap.after,
        rating_delta: snap.delta,
        occurred_at: occurred,
        is_backfilled: true,
        metadata: { backfill_source: 'games.rating_last_update', p1_bucket: p1 },
      });
    }

    const badge = upd.badge;
    if (eco === 'free' && badge?.applied === true && badge.track_key) {
      const exactTrack = BADGE_TO_TRACK[badge.track_key];
      const ticker = id === g.white_player_id ? badge.white : badge.black;
      if (
        exactTrack &&
        ticker &&
        typeof ticker.rating_before === 'number' &&
        typeof ticker.rating_after === 'number'
      ) {
        out.push({
          player_id: id,
          rating_track_id: exactTrack,
          ecosystem: 'free',
          rating_scope: 'exact_time_control',
          mode: MODE_MAP[p1] ?? null,
          time_control: g.live_time_control,
          badge_track_key: badge.track_key,
          event_type: 'backfill',
          game_id: g.id,
          opponent_id: opp,
          result: resultForPlayer(g.result, id, g.white_player_id, g.black_player_id),
          rating_before: ticker.rating_before,
          rating_after: ticker.rating_after,
          rating_delta:
            typeof ticker.rating_delta === 'number'
              ? ticker.rating_delta
              : ticker.rating_after - ticker.rating_before,
          occurred_at: occurred,
          badge_state_after: mapBadgeVisual(ticker.visual_state),
          badge_event: mapBadgeEvent(ticker.event_type),
          streak_after: ticker.win_streak ?? null,
          is_backfilled: true,
          metadata: {
            backfill_source: 'games.rating_last_update',
            badge_track_key: badge.track_key,
          },
        });
      }
    }
  }

  return out;
}

async function main() {
  console.log(`Backfill rating history ledger${dryRun ? ' (DRY RUN)' : ''}`);
  let q = supabase
    .from('games')
    .select(
      'id,finished_at,created_at,white_player_id,black_player_id,play_context,tempo,live_time_control,rated,rating_applied,rating_last_update,result',
    )
    .eq('status', 'finished')
    .eq('rated', true)
    .eq('rating_applied', true)
    .not('rating_last_update', 'is', null)
    .order('finished_at', { ascending: true });

  if (limit) q = q.limit(limit);

  const { data: games, error } = await q;
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const eligible = games?.length ?? 0;
  let inserted = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const g of games ?? []) {
    const rows = rowsForGame(g);
    if (rows.length === 0) {
      skipped += 1;
      continue;
    }

    for (const row of rows) {
      if (dryRun) {
        inserted += 1;
        continue;
      }

      const { error: insErr } = await supabase.from('player_rating_history_ledger').insert(row);
      if (insErr) {
        if (insErr.code === '23505') {
          duplicates += 1;
        } else {
          console.warn('Insert skip', g.id, row.rating_track_id, insErr.message);
          skipped += 1;
        }
      } else {
        inserted += 1;
      }
    }
  }

  console.log('Eligible games:', eligible);
  console.log('Rows inserted (or would insert):', inserted);
  console.log('Skipped games/rows:', skipped);
  console.log('Duplicates (idempotent):', duplicates);
  console.log('Duplicate-safe: partial unique indexes on (player, track, game) for backfill/game');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
