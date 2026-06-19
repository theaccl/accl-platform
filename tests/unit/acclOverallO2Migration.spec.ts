import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const MIGRATION = '20260621170000_accl_overall_o2_free_play_atomic_dual_write.sql';
const O1_MIGRATION = '20260621160000_accl_overall_o1_bucket_foundation_snapshot_separation.sql';
const PRIOR_APPLY_MIGRATION = '20260619180000_free_play_true_elo_rating.sql';

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
}

function o2Sql(): string {
  return readMigration(MIGRATION);
}

function o2ImplementationSql(): string {
  return o2Sql().split('-- 5) O2 post-check')[0];
}

function countHelperParameters(sql: string): number {
  const match = sql.match(
    /create or replace function public\.rating_history_ledger_insert_row\s*\(([\s\S]*?)\)\s*returns uuid/is,
  );
  if (!match) return 0;
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--')).length;
}

function applyCoreSection(sql: string): string {
  return (
    sql.match(
      /create or replace function public\.apply_free_play_rating_update_core[\s\S]*?\$\$;/i,
    )?.[0] ?? ''
  );
}

const ACCL_WHITE_SEED_MARKER = "values (r.white_player_id, 'accl_overall', 1500, 0)";
const ACCL_BLOCK_GUARD = "if ctx = 'free' then";
const ACCL_ELO_B_MARKER = 'v_elo_accl_b := jsonb_build_object(';
const ACCL_BLOCK_END = 'end if;';

function extractAcclApplyBlock(coreSection: string): string {
  const seedIdx = coreSection.indexOf(ACCL_WHITE_SEED_MARKER);
  expect(seedIdx, 'ACCL white seed marker must exist in apply core').toBeGreaterThan(-1);

  const start = coreSection.lastIndexOf(ACCL_BLOCK_GUARD, seedIdx);
  expect(start, 'ACCL free-play guard must precede white seed marker').toBeGreaterThan(-1);
  expect(start).toBeLessThan(seedIdx);

  const eloBIdx = coreSection.indexOf(ACCL_ELO_B_MARKER, seedIdx);
  expect(eloBIdx, 'v_elo_accl_b marker must exist after ACCL seed').toBeGreaterThan(-1);

  const endIdx = coreSection.indexOf(ACCL_BLOCK_END, eloBIdx);
  expect(endIdx, 'ACCL block end if must follow v_elo_accl_b').toBeGreaterThan(-1);

  return coreSection.slice(start, endIdx + ACCL_BLOCK_END.length);
}

function extractAcclOverallUpdateStatements(acclBlock: string): string[] {
  return (
    acclBlock.match(/update public\.player_ratings[\s\S]*?where[\s\S]*?;/g) ?? []
  ).filter((stmt) => stmt.includes("bucket = 'accl_overall'"));
}

function extractTournamentModeElseBranch(coreSection: string): string {
  const match = coreSection.match(
    /if ctx = 'free' then\s*\n\s*v_model := 'v2_elo_free'[\s\S]*?\n\s*else([\s\S]*?)\n\s*end if;/,
  );
  expect(match, 'Tournament mode else branch must be extractable from apply core').toBeTruthy();
  return match![1];
}

function o2PostCheckSql(): string {
  return o2Sql().split('-- 5) O2 post-check')[1] ?? '';
}

test.describe('acclOverall O2 migration (static acceptance)', () => {
  test('migration file exists and sorts after O1', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toContain(MIGRATION);
    expect(MIGRATION > O1_MIGRATION).toBe(true);
    expect(files.filter((f) => f.includes('accl_overall_o2'))).toHaveLength(1);
  });

  test('bucket-specific constraint permits accl_overall above 4000 and caps other buckets', () => {
    const sql = o2Sql();
    expect(sql).toContain('player_ratings_rating_reasonable');
    expect(sql).toMatch(/rating\s*>=\s*100/i);
    expect(sql).toContain("bucket = 'accl_overall'");
    expect(sql).toMatch(/or\s+rating\s*<=\s*4000/i);
  });

  test('helper keeps 22-parameter signature with no drop overload or 23rd parameter', () => {
    const sql = o2Sql();
    expect(sql).not.toMatch(/drop function public\.rating_history_ledger_insert_row/i);
    expect(sql).not.toMatch(/p_rating_model_version/i);
    expect(countHelperParameters(sql)).toBe(22);
    expect(sql).toContain("create or replace function public.rating_history_ledger_insert_row(");
  });

  test('deterministic track/scope CASE writes v3_accl_overall_elo; mode rows retain v1 column', () => {
    const sql = o2Sql();
    expect(sql).toMatch(
      /when p_rating_track_id = 'accl'\s*\n\s*and p_rating_scope = 'overall'\s*\n\s*then 'v3_accl_overall_elo'/,
    );
    expect(sql).toMatch(/else\s*'v1'\s*\n\s*end,/);
    expect(sql).not.toMatch(/p_metadata->>'rating_model_version'/);
  });

  test('ACCL apply reads accl_overall bucket and uses independent Elo helpers', () => {
    const acclBlock = extractAcclApplyBlock(applyCoreSection(o2Sql()));
    expect(acclBlock.startsWith("if ctx = 'free' then")).toBe(true);
    expect(acclBlock).toMatch(/bucket = 'accl_overall'/);
    expect(acclBlock).toContain('elo_k_factor_for_games_played(w_gp_accl)');
    expect(acclBlock).toContain('elo_k_factor_for_games_played(b_gp_accl)');
    expect(acclBlock).toContain('elo_expected_score(w_before_accl, b_before_accl)');
    expect(acclBlock).toContain('elo_expected_score(b_before_accl, w_before_accl)');
    expect(acclBlock).toContain("v_elo_accl_w := jsonb_build_object(");
    expect(acclBlock).not.toContain("v_model := 'v2_elo_free'");
    expect(acclBlock).not.toContain("v_model := 'v1_fixed_tournament'");
  });

  test('ACCL apply math has floor 100 and no upper 4000 clamp; mode math remains capped', () => {
    const sql = o2Sql();
    const coreSection =
      sql.match(
        /create or replace function public\.apply_free_play_rating_update_core[\s\S]*?\$\$;/i,
      )?.[0] ?? '';
    expect(coreSection).toContain('w_after_accl := greatest(100, w_before_accl + w_delta_accl)');
    expect(coreSection).toContain('b_after_accl := greatest(100, b_before_accl + b_delta_accl)');
    expect(coreSection).not.toMatch(/least\(4000,\s*w_before_accl/);
    expect(coreSection).not.toMatch(/least\(4000,\s*b_before_accl/);
    expect(coreSection).toContain('greatest(100, least(4000, w_before_p + w_delta))');
  });

  test('both White and Black ACCL rows and games_played increment in free-play block only', () => {
    const acclBlock = extractAcclApplyBlock(applyCoreSection(o2Sql()));
    expect(acclBlock.startsWith(ACCL_BLOCK_GUARD)).toBe(true);
    expect(acclBlock.endsWith(ACCL_BLOCK_END)).toBe(true);
    expect(acclBlock).toContain('for update');
    expect(acclBlock).toContain('accl_overall white update expected 1 row');
    expect(acclBlock).toContain('accl_overall black update expected 1 row');

    const acclUpdates = extractAcclOverallUpdateStatements(acclBlock);
    expect(acclUpdates).toHaveLength(2);
    expect(acclUpdates[0]).toMatch(/user_id = r\.white_player_id and bucket = 'accl_overall'/);
    expect(acclUpdates[1]).toMatch(/user_id = r\.black_player_id and bucket = 'accl_overall'/);
    expect(acclUpdates[0].match(/games_played = games_played \+ 1/g)?.length ?? 0).toBe(1);
    expect(acclUpdates[1].match(/games_played = games_played \+ 1/g)?.length ?? 0).toBe(1);
  });

  test('tournament context does not write ACCL Overall; tournament settlement unchanged', () => {
    const coreSection = applyCoreSection(o2Sql());
    const tournamentBranch = extractTournamentModeElseBranch(coreSection);
    const acclBlock = extractAcclApplyBlock(coreSection);

    expect(tournamentBranch).toContain("v_model := 'v1_fixed_tournament'");
    expect(tournamentBranch).toMatch(/w_delta := 10;\s*\n\s*b_delta := -10;/);
    expect(tournamentBranch).not.toMatch(/accl_overall/);
    expect(tournamentBranch).not.toMatch(/w_gp_accl|b_gp_accl|w_before_accl|b_before_accl/);
    expect(tournamentBranch).not.toMatch(/v_elo_accl_w|v_elo_accl_b/);
    expect(tournamentBranch).not.toContain('accl_white');
    expect(tournamentBranch).not.toContain('accl_black');

    expect(acclBlock.startsWith("if ctx = 'free' then")).toBe(true);
    expect(acclBlock.endsWith('end if;')).toBe(true);
    expect(acclBlock).not.toContain("v_model := 'v1_fixed_tournament'");
  });

  test('append adds additive ACCL ledger rows with locked shape; mode rows preserved', () => {
    const sql = o2Sql();
    const appendSection =
      sql.match(
        /create or replace function public\.append_rating_history_ledger_for_game_apply[\s\S]*?\$\$;/i,
      )?.[0] ?? '';
    expect(appendSection).toContain("'mode'");
    expect(appendSection).toMatch(/if v_ctx = 'free' then[\s\S]*'accl'/);
    expect(appendSection).toContain("'global'");
    expect(appendSection).toContain("'overall'");
    expect(appendSection).toContain("'v3_accl_overall_elo'");
    expect(appendSection).toContain("p_rating_snapshot->'accl_white'");
    expect(appendSection).toContain("p_rating_snapshot->'accl_black'");
    const acclAppendBlock =
      appendSection.match(/if v_ctx = 'free' then[\s\S]*?end if;/)?.[0] ?? '';
    expect(acclAppendBlock).toContain("'accl'");
    expect(acclAppendBlock).toContain("'global'");
    expect(acclAppendBlock).toContain("'overall'");
  });

  test('preserves idempotency badge order ledger order and rating_applied flip last', () => {
    const sql = o2Sql();
    expect(sql).toContain("coalesce(r.rating_applied, false)");
    expect(sql).toContain('concurrent_apply_or_already_applied');
    const coreSection =
      sql.match(
        /create or replace function public\.apply_free_play_rating_update_core[\s\S]*?\$\$;/i,
      )?.[0] ?? '';
    const badgeIdx = coreSection.indexOf('apply_free_play_badge_settlement(p_game_id, out)');
    const ledgerIdx = coreSection.indexOf('append_rating_history_ledger_for_game_apply(p_game_id, out, v_badge)');
    const flipIdx = coreSection.indexOf('rating_applied = true');
    expect(badgeIdx).toBeGreaterThan(-1);
    expect(ledgerIdx).toBeGreaterThan(badgeIdx);
    expect(flipIdx).toBeGreaterThan(ledgerIdx);
  });

  test('preserves free-play v2_elo_free mode path from prior migration', () => {
    const sql = o2Sql();
    expect(sql).toContain("v_model := 'v2_elo_free'");
    expect(sql).toContain('round(w_k * (w_score - w_e))::int');
    expect(sql).toContain('round(b_k * (b_score - b_e))::int');
    const prior = readMigration(PRIOR_APPLY_MIGRATION);
    expect(prior).toContain("v_model := 'v2_elo_free'");
  });

  test('N01 — no badge activation or player_badge_state writes', () => {
    const sql = o2ImplementationSql();
    expect(sql).not.toMatch(/insert into public\.player_badge_state/i);
    expect(sql).not.toMatch(/update public\.player_badge_state/i);
    expect(sql).not.toMatch(/settle_player_badge_state/i);
  });

  test('N02 — no exact-control ledger activation beyond existing gated path', () => {
    const sql = o2Sql();
    const appendSection =
      sql.match(
        /create or replace function public\.append_rating_history_ledger_for_game_apply[\s\S]*?\$\$;/i,
      )?.[0] ?? '';
    expect(appendSection).toContain("'exact_time_control'");
    expect(appendSection).toContain("coalesce(p_badge_snapshot->>'applied', '') = 'true'");
  });

  test('N03 — no trigger snapshot RPC or tournament_unified copy changes', () => {
    const sql = o2Sql();
    expect(sql).not.toMatch(/create trigger games_apply_free_rating_after_finish/i);
    expect(sql).not.toMatch(/create or replace function public\.trg_games_apply_free_rating_after_finish/i);
    expect(sql).not.toMatch(/create or replace function public\.get_public_profile_snapshot/i);
    expect(sql).not.toMatch(/tournament_unified[\s\S]*'accl_overall'/);
    expect(sql).not.toMatch(/select[\s\S]*pr\.rating[\s\S]*'accl_overall'/i);
  });

  test('O2 post-check block present with meaningful fail-closed checks', () => {
    const postCheck = o2PostCheckSql();
    expect(postCheck).toContain('O2 post-check failed');
    expect(postCheck).toContain('player_ratings_rating_reasonable missing accl_overall exception');
    expect(postCheck).toContain("position('accl_overall' in v_constraint_def)");
    expect(postCheck).toContain("position('bucket = ''accl_overall''' in v_core_def)");
    expect(postCheck).toContain('v3_accl_overall_elo');
    expect(postCheck).toContain('v2_elo_free');
    expect(postCheck).toContain("position('''accl''' in v_append_def)");
    expect(postCheck).toContain("position('''global''' in v_append_def)");
    expect(postCheck).toContain("position('''overall''' in v_append_def)");
  });
});
