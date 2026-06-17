import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { acclRatingFromP1 } from '../../lib/p1PublicRatingRead';
import { topLevelRatingCardsFromP1 } from '../../lib/profileRatingTracks';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const MIGRATION = '20260621160000_accl_overall_o1_bucket_foundation_snapshot_separation.sql';
const APPLY_CORE_MIGRATION = '20260619180000_free_play_true_elo_rating.sql';
const BR1_MIGRATION = '20260621150000_production_rating_baseline_reconciliation.sql';

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
}

function o1Sql(): string {
  return readMigration(MIGRATION);
}

test.describe('acclOverall O1 migration (static acceptance)', () => {
  test('M01 — bucket CHECK includes accl_overall', () => {
    const sql = o1Sql();
    expect(sql).toContain("'accl_overall'");
    expect(sql).toContain('player_ratings_bucket_check');
  });

  test('M02 — missing accl_overall rows seeded from profiles', () => {
    const sql = o1Sql();
    expect(sql).toMatch(/from public\.profiles p/i);
    expect(sql).toContain("'accl_overall'");
    expect(sql).toMatch(/where not exists/i);
  });

  test('M03 — seed rating is exactly 1500', () => {
    const sql = o1Sql();
    expect(sql).toMatch(/'accl_overall',\s*1500,\s*0/);
  });

  test('M04 — seed games_played is exactly 0', () => {
    const sql = o1Sql();
    expect(sql).toMatch(/'accl_overall',\s*1500,\s*0/);
  });

  test('M05 — existing accl_overall rows are not overwritten', () => {
    const sql = o1Sql();
    expect(sql).toMatch(/where not exists/i);
    expect(sql).not.toMatch(/on conflict\s*\(\s*user_id\s*,\s*bucket\s*\)\s*do update/i);
  });

  test('M06 — migration does not reference games for O1 backfill', () => {
    const sql = o1Sql();
    const seedSection = sql.split('-- 4) Snapshot')[0];
    expect(seedSection).not.toMatch(/\bfrom public\.games\b/i);
  });

  test('M07 — migration does not reference rating ledger/history for backfill', () => {
    const sql = o1Sql();
    const seedSection = sql.split('-- 4) Snapshot')[0];
    expect(seedSection).not.toMatch(/player_rating_history_ledger/i);
  });

  test('R01 — get_public_profile_snapshot returns p1.accl_rating from accl_overall', () => {
    const sql = o1Sql();
    expect(sql).toContain("'accl_rating', v_accl");
    expect(sql).toMatch(/pr\.bucket = 'accl_overall'/);
  });

  test('R02 — p1.accl_overall object exists with rating and games_played', () => {
    const sql = o1Sql();
    expect(sql).toContain("'accl_overall', (");
    expect(sql).toMatch(/'rating', pr\.rating/);
    expect(sql).toMatch(/'games_played', pr\.games_played/);
  });

  test('R03 — tournament_rating remains tournament-only', () => {
    const sql = o1Sql();
    expect(sql).toContain("'tournament_rating', v_tu");
    expect(sql).toMatch(/pr\.bucket = 'tournament_unified'/);
  });

  test('R04 — tournament_unified is not used as accl_rating source', () => {
    const sql = o1Sql();
    expect(sql).not.toContain("'accl_rating', v_tu");
    expect(sql).not.toMatch(/'accl_rating',\s*v_tu/);
  });

  test('T01 — local reader tolerates explicit accl_overall', () => {
    const rating = acclRatingFromP1(
      {
        accl_rating: null,
        accl_overall: { rating: 1500, games_played: 0 },
        tournament_rating: 1620,
        tournament_unified: { rating: 1620, games_played: 12 },
        free_bullet: null,
        free_blitz: null,
        free_rapid: null,
        free_day: null,
      },
      null,
    );
    expect(rating).toBe(1500);
  });

  test('T02 — legacy p1.accl_rating compatibility field remains available', () => {
    const rating = acclRatingFromP1(
      {
        accl_rating: 1500,
        accl_overall: { rating: 1500, games_played: 0 },
        tournament_rating: 1620,
        tournament_unified: { rating: 1620, games_played: 12 },
        free_bullet: null,
        free_blitz: null,
        free_rapid: null,
        free_day: null,
      },
      null,
    );
    expect(rating).toBe(1500);
  });

  test('T03 — dashboard cards do not force accl↔tournament fallback after O1', () => {
    const cards = topLevelRatingCardsFromP1({
      accl_rating: 1500,
      accl_overall: { rating: 1500, games_played: 0 },
      tournament_rating: 1620,
      tournament_unified: { rating: 1620, games_played: 12 },
      free_bullet: null,
      free_blitz: null,
      free_rapid: null,
      free_day: null,
    });
    const accl = cards.find((c) => c.id === 'accl');
    const tournament = cards.find((c) => c.id === 'tournament');
    expect(accl?.rating).toBe(1500);
    expect(tournament?.rating).toBe(1620);
    expect(accl?.rating).not.toBe(tournament?.rating);
    const tracksSrc = readFileSync(join(process.cwd(), 'lib/profileRatingTracks.ts'), 'utf8');
    const acclBlock = tracksSrc.match(/\{\s*id: 'accl'[\s\S]*?\},/)?.[0] ?? '';
    expect(acclBlock).toContain('accl_overall');
    expect(acclBlock).not.toContain('tournament_unified');
  });

  test('N01 — no tournament_unified copy into accl_overall', () => {
    const sql = o1Sql();
    const backfill =
      sql.match(
        /-- 2\)[\s\S]*?insert into public\.player_ratings[\s\S]*?from public\.profiles[\s\S]*?\);/,
      )?.[0] ?? '';
    expect(backfill).toContain("'accl_overall', 1500, 0");
    expect(backfill).not.toContain('tournament_unified');
    expect(backfill).not.toMatch(/select[\s\S]*pr\.rating[\s\S]*'accl_overall'/i);
  });

  test('N02 — no apply_free_play_rating_update_core dual-write', () => {
    const sql = o1Sql();
    expect(sql).not.toMatch(/create or replace function public\.apply_free_play_rating_update_core/i);
    const applyCore = readMigration(APPLY_CORE_MIGRATION);
    expect(applyCore).toContain('create or replace function public.apply_free_play_rating_update_core');
  });

  test('N03 — no player_badge_state write', () => {
    const sql = o1Sql();
    expect(sql).not.toMatch(/insert into public\.player_badge_state/i);
    expect(sql).not.toMatch(/update public\.player_badge_state/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+table\s+public\.player_badge_state/i);
  });

  test('N04 — no badge settlement activation', () => {
    const sql = o1Sql();
    expect(sql).not.toContain('settle_player_badge_state');
    expect(sql).not.toContain('apply_free_play_badge_settlement');
    const br1 = readMigration(BR1_MIGRATION);
    expect(br1).toContain('stage3_badge_state_mutation_disabled');
  });

  test('migration sorts after BR1 and is unique', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toContain(MIGRATION);
    expect(MIGRATION > BR1_MIGRATION).toBe(true);
    expect(files.filter((f) => f.includes('accl_overall_o1'))).toHaveLength(1);
  });

  test('seed trigger includes accl_overall for new profiles', () => {
    const sql = o1Sql();
    expect(sql).toContain("('accl_overall')");
    expect(sql).toContain('create or replace function public.trg_profiles_seed_player_ratings');
  });
});
