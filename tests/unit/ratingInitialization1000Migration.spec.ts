import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STARTING_RATING } from '@/lib/eloRating';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const MIGRATION = '20260625120000_rating_initialization_baseline_1000.sql';
const O2_MIGRATION = '20260621170000_accl_overall_o2_free_play_atomic_dual_write.sql';

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
}

function migrationSql(): string {
  return readMigration(MIGRATION);
}

const MAJOR_FAMILIES = [
  'accl_overall',
  'tournament_unified',
  'free_bullet',
  'free_blitz',
  'free_rapid',
  'free_day',
] as const;

const TRIGGER_BUCKETS = [
  'free_live',
  'free_daily',
  'free_correspondence',
  'tournament_live',
  'tournament_daily',
  'tournament_correspondence',
  ...MAJOR_FAMILIES,
] as const;

const LEGACY_TRIGGER_BUCKETS = [
  'free_live',
  'free_daily',
  'free_correspondence',
  'tournament_live',
  'tournament_daily',
  'tournament_correspondence',
] as const;

test.describe('rating initialization 1000 migration (static acceptance)', () => {
  test('frozen marker present', () => {
    expect(migrationSql()).toContain('ACCL_RATING_INITIALIZATION_1000_FROZEN');
  });

  test('player_ratings default becomes 1000', () => {
    expect(migrationSql()).toMatch(/alter column rating set default 1000/i);
  });

  test('profile seed trigger inserts 1000 for all buckets', () => {
    const sql = migrationSql();
    expect(sql).toContain('create or replace function public.trg_profiles_seed_player_ratings()');
    expect(sql).toMatch(/select new\.id, v\.bucket, 1000, 0/);
    for (const bucket of TRIGGER_BUCKETS) {
      expect(sql).toContain(`'${bucket}'`);
    }
  });

  test('legacy trigger buckets remain provisioned at 1000 for schema parity', () => {
    const sql = migrationSql();
    for (const bucket of LEGACY_TRIGGER_BUCKETS) {
      expect(sql).toContain(`'${bucket}'`);
    }
    expect(sql).not.toMatch(/major-family correction[\s\S]*free_live/i);
  });

  test('apply core lazy inserts patched with exact replacement count guards', () => {
    const sql = migrationSql();
    expect(sql).toContain("v_expected_replacements constant int := 6");
    expect(sql).toContain("replace(v_def, v_seed_literal, v_new_literal)");
    expect(sql).toMatch(/lazy-insert seed literal count mismatch \(found %, expected %\)/);
    expect(sql).toMatch(/already patched but lazy-insert 1000 seed count mismatch/);
    expect(sql).toMatch(/lazy-insert seed literal count after patch mismatch/);
    expect(sql).toMatch(/missing v2_elo_free marker; refusing dynamic patch/);
  });

  test('historical O2 migration file remains untouched', () => {
    expect(readMigration(O2_MIGRATION)).toContain("values (r.white_player_id, 'accl_overall', 1500, 0)");
  });

  test('major family bucket helper lists six families', () => {
    const sql = migrationSql();
    for (const bucket of MAJOR_FAMILIES) {
      expect(sql).toContain(`'${bucket}'`);
    }
  });

  test('eligibility requires no games participation', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/from public\.games g/i);
    expect(sql).toMatch(/white_player_id = p_user_id[\s\S]*black_player_id = p_user_id/);
  });

  test('eligibility requires no rating ledger activity', () => {
    expect(migrationSql()).toMatch(/from public\.player_rating_history_ledger l/i);
  });

  test('eligibility excludes tournament registration', () => {
    expect(migrationSql()).toMatch(/from public\.tournament_entries te/i);
  });

  test('eligibility excludes platform bot UUIDs', () => {
    const sql = migrationSql();
    expect(sql).toContain('accl_is_platform_bot_user_id');
    expect(sql).toContain('10000000-0000-0000-0000-000000000001');
    expect(sql).toContain('9bc30963-68d9-41b7-a442-b38c450301d2');
  });

  test('eligibility rejects mixed or non-legacy major-family values', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/pr\.rating <> 1500/);
    expect(sql).toMatch(/pr\.games_played <> 0/);
  });

  test('eligibility rejects any bucket with games_played > 0', () => {
    expect(migrationSql()).toMatch(/pr_any\.games_played > 0/);
  });

  test('transaction locks acquired before default, trigger, snapshot, and correction', () => {
    const sql = migrationSql();
    const lockPos = sql.indexOf('in share row exclusive mode');
    expect(lockPos).toBeGreaterThan(-1);
    expect(sql.indexOf('alter column rating set default 1000')).toBeGreaterThan(lockPos);
    expect(sql.indexOf('create or replace function public.trg_profiles_seed_player_ratings()')).toBeGreaterThan(lockPos);
    expect(sql.indexOf('create temp table accl_rating_init_major_before')).toBeGreaterThan(lockPos);
    expect(sql.indexOf('update public.player_ratings pr')).toBeGreaterThan(lockPos);
    expect(sql).toMatch(/lock table[\s\S]*public\.profiles[\s\S]*public\.games[\s\S]*public\.tournament_entries[\s\S]*public\.player_rating_history_ledger[\s\S]*public\.player_ratings[\s\S]*in share row exclusive mode/i);
  });

  test('correction updates only legacy 1500 rows on major families for captured candidates', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/set rating = 1000/);
    expect(sql).toMatch(/pr\.rating = 1500/);
    expect(sql).toMatch(/from accl_rating_init_correction_candidates c[\s\S]*where c\.user_id = pr\.user_id/);
    expect(sql).not.toMatch(/update public\.player_ratings pr[\s\S]*accl_is_zero_game_legacy_rating_seed_eligible\(pr\.user_id\)/);
  });

  test('missing-row insert and legacy update use captured candidate cohort only', () => {
    const sql = migrationSql();
    const correctionSection = sql.slice(sql.indexOf('create temp table accl_rating_init_correction_candidates'));
    expect(correctionSection).toMatch(
      /insert into public\.player_ratings \(user_id, bucket, rating, games_played\)[\s\S]*from accl_rating_init_correction_candidates e/,
    );
    expect(correctionSection).not.toContain('accl_is_zero_game_legacy_rating_seed_eligible(e.user_id)');
    expect(correctionSection).toMatch(
      /update public\.player_ratings pr[\s\S]*exists \([\s\S]*from accl_rating_init_correction_candidates c[\s\S]*where c\.user_id = pr\.user_id/,
    );
  });

  test('partial-row candidate uses captured cohort after missing-family insert', () => {
    const sql = migrationSql();
    const correctionSection = sql.slice(sql.indexOf('create temp table accl_rating_init_correction_candidates'));
    const insertPos = correctionSection.indexOf(
      'insert into public.player_ratings (user_id, bucket, rating, games_played)',
    );
    const updatePos = correctionSection.indexOf('update public.player_ratings pr');
    expect(insertPos).toBeGreaterThan(-1);
    expect(updatePos).toBeGreaterThan(insertPos);
    expect(correctionSection.slice(insertPos, updatePos)).not.toContain(
      'accl_is_zero_game_legacy_rating_seed_eligible',
    );
    expect(correctionSection.slice(updatePos)).toMatch(
      /exists \([\s\S]*from accl_rating_init_correction_candidates c[\s\S]*where c\.user_id = pr\.user_id/,
    );
    expect(correctionSection).toMatch(
      /create temp table accl_rating_init_correction_candidates on commit drop as[\s\S]*accl_is_zero_game_legacy_rating_seed_eligible/,
    );
  });

  test('transaction-local snapshot captured before correction', () => {
    const sql = migrationSql();
    expect(sql).toContain('create temp table accl_rating_init_major_before on commit drop');
    expect(sql).toContain('create temp table accl_rating_init_correction_candidates on commit drop');
  });

  test('missing major-family rows repaired at 1000', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/insert into public\.player_ratings[\s\S]*1000, 0/);
    expect(sql).toMatch(/on conflict \(user_id, bucket\) do nothing/);
  });

  test('correction does not insert rating-history ledger events', () => {
    expect(migrationSql()).not.toMatch(/insert into public\.player_rating_history_ledger/i);
  });

  test('post-check fails when eligible accounts are not fully at 1000', () => {
    expect(migrationSql()).toMatch(/correction-candidate accounts not fully at 1000\/0/i);
  });

  test('post-check fails when ineligible active accounts were corrected', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/ineligible major-family rows changed/);
    expect(sql).toMatch(/accl_rating_init_major_before/);
    expect(sql).toMatch(/accl_rating_init_correction_candidates/);
    expect(sql).toMatch(/partial_six_family|missing a corrected major family/);
  });

  test('helper functions use fixed search_path and revoke public execute', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/security invoker[\s\S]*set search_path = public/);
    expect(sql).toMatch(/revoke all on function public\.accl_is_zero_game_legacy_rating_seed_eligible\(uuid\) from public/);
    expect(sql).toMatch(/revoke all on function public\.accl_is_zero_game_legacy_rating_seed_eligible\(uuid\) from authenticated/);
    expect(sql).toMatch(/grant execute on function public\.accl_is_zero_game_legacy_rating_seed_eligible\(uuid\) to service_role/);
  });

  test('dynamic patch resolves exact apply_free_play_rating_update_core(uuid) signature', () => {
    expect(migrationSql()).toContain("to_regprocedure('public.apply_free_play_rating_update_core(uuid)')");
  });

  test('verification SQL is read-only and exposes stable post-apply cohort metrics', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/RATING_INITIALIZATION_1000_VERIFICATION.sql'), 'utf8');
    expect(sql).toContain('conservatively_eligible_zero_game_accounts_pre_apply_predicate');
    expect(sql).toContain('stable_zero_game_major_family_fully_at_1000_gp0');
    expect(sql).toContain('legacy_1500_major_family_rows_remaining');
    expect(sql).toContain('partial_six_family_correction_detected');
    expect(sql).not.toMatch(/\b(insert|update|delete|alter|drop|truncate)\b/i);
    expect(sql).not.toMatch(/\bemail\b/i);
  });

  test('verification SQL is self-contained for pre-apply and post-apply runs', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/RATING_INITIALIZATION_1000_VERIFICATION.sql'), 'utf8');
    expect(sql).not.toContain('accl_rating_initialization_major_family_buckets');
    expect(sql).not.toContain('accl_is_zero_game_legacy_rating_seed_eligible');
    expect(sql).not.toContain('accl_is_platform_bot_user_id');
    expect(sql).toMatch(/major_buckets as \(\s*select v\.bucket\s*from \(\s*values[\s\S]*\('accl_overall'\)/);
    for (const bucket of MAJOR_FAMILIES) {
      expect(sql).toContain(`('${bucket}')`);
    }
    expect(sql).not.toMatch(/\b(username|token|password|secret)\b/i);
    expect(sql).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/i);
    expect(sql).not.toMatch(/\bcreate\s+table\b/i);
  });

  test('controlling documentation states 1000 seed doctrine', () => {
    const doc = readFileSync(join(process.cwd(), 'docs/rating-initialization-1000.md'), 'utf8');
    expect(doc).toContain('**1000**');
    expect(doc).toContain('never** reset');
    expect(doc).toContain('does **not** write rating-history ledger events');
    expect(doc).toContain('Badge settlement 1500 remains separate future-owner scope');
  });
});

test.describe('rating initialization 1000 idempotency guards', () => {
  test('rerun safety uses legacy 1500 predicate and on conflict do nothing', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/pr\.rating = 1500/);
    expect(sql).toMatch(/on conflict \(user_id, bucket\) do nothing/);
  });
});

test.describe('rating initialization 1000 app mirror', () => {
  test('TS STARTING_RATING matches SQL seed', () => {
    expect(STARTING_RATING).toBe(1000);
  });

  test('login and profile paths do not hardcode 1500 new-player fallback', () => {
    const login = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8');
    expect(login).not.toMatch(/STARTING_RATING\s*=\s*1500/);
    expect(login).not.toContain('fallbackRating: 1500');
  });
});

test.describe('rating initialization 1000 isolation guards', () => {
  test('migration does not replace finish_game or rewrite O2 apply formula body', () => {
    const sql = migrationSql();
    expect(sql).not.toMatch(/create or replace function public\.finish_game/i);
    expect(sql).not.toMatch(/create or replace function public\.apply_free_play_rating_update_core/i);
    expect(sql).not.toMatch(/expected score/i);
    expect(sql).toContain('pg_get_functiondef');
  });

  test('migration does not edit prior migration files', () => {
    expect(readMigration(O2_MIGRATION)).toContain('O2_FREE_PLAY_ATOMIC_DUAL_WRITE');
  });

  test('badge settlement mirror remains separate from player_ratings seed', () => {
    const badge = readFileSync(join(process.cwd(), 'lib/badgeTracks.ts'), 'utf8');
    expect(badge).toContain('defaultSettlementRatingForNewTrack');
    expect(badge).toContain('return 1500');
    expect(migrationSql()).not.toMatch(/player_badge_state/);
  });
});
