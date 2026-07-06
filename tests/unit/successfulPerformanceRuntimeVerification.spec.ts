import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = 'SUCCESSFUL_PERFORMANCE_V1_RUNTIME_VERIFICATION.sql';
const READINESS = join('docs', 'phase-locks', 'SUCCESSFUL_PERFORMANCE_V1_BACKEND_READINESS.md');

function readScript(): string {
  return readFileSync(join(process.cwd(), 'supabase', SCRIPT), 'utf8');
}

function readReadiness(): string {
  return readFileSync(join(process.cwd(), READINESS), 'utf8');
}

function stripPlpgsqlBodies(sql: string): string {
  return sql
    .replace(/do \$[\w]*\$[\s\S]*?\$[\w]*\$;/g, '')
    .replace(/as \$\$[\s\S]*?\$\$;/g, '');
}

function spv1AssertFunction(sql: string): string {
  const match = sql.match(/create or replace function pg_temp\.spv1_assert[\s\S]*?\$\$;/);
  expect(match, 'pg_temp.spv1_assert definition').toBeTruthy();
  return match![0];
}

test.describe('successfulPerformanceRuntimeVerification (static script guards)', () => {
  test('runtime script uses psql meta-commands only (not SQL Editor)', () => {
    const sql = readScript();
    expect(sql).toContain('\\set ON_ERROR_STOP on');
    expect(sql).toContain('psql "$NON_PRODUCTION_DATABASE_URL"');
    expect(sql).not.toMatch(/supabase sql editor/i);
  });

  test('no top-level PERFORM outside PL/pgSQL blocks', () => {
    const sql = stripPlpgsqlBodies(readScript());
    expect(sql).not.toMatch(/^\s*perform\s+/im);
    expect(sql).toContain("select set_config('spv1.owner_role', current_user, true)");
  });

  test('assertion framework uses SQLSTATE SP001 not P0001', () => {
    const sql = readScript();
    const assertFn = spv1AssertFunction(sql);
    expect(assertFn).toMatch(/errcode = 'SP001'/);
    expect(assertFn).not.toMatch(/errcode = 'P0001'/);
    expect(assertFn).toContain('SPV1_ASSERTION_FAILED:');
  });

  test('unauthenticated handler distinguishes expected RPC P0001 from framework SP001', () => {
    const sql = readScript();
    const block = sql.slice(sql.indexOf('unauthenticated refused'), sql.indexOf('empty function identity arguments'));
    expect(block).toMatch(/when sqlstate 'SP001' then\s*\n\s*raise;/);
    expect(block).toMatch(/when sqlstate 'P0001' then[\s\S]*not_authenticated/);
    expect(block).not.toMatch(/when others then[\s\S]*spv1_assert\([\s\S]*'unauthenticated refused'/);
  });

  test('profiles fixture uses foundation columns only (no display_name)', () => {
    const sql = readScript();
    expect(sql).toMatch(/insert into public\.profiles \(id, username, email\)/);
    expect(sql).not.toContain("spv1_require_column('public', 'profiles', 'display_name')");
    expect(sql).not.toMatch(/display_name/i);
  });

  test('missing white player supports NOT NULL rejection and RPC exclusion branches', () => {
    const sql = readScript();
    const block = sql.slice(
      sql.indexOf('missing white player excluded via RPC void predicate'),
      sql.indexOf('v_game := pg_temp.spv1_insert_game(u_a, u_b, \'white_win\', \'resign\', \'free\', \'live\', \'1m\', true, \'challenge\', null, null, true);\n  perform pg_temp.spv1_as_owner();\n  update public.games set black_player_id'),
    );
    expect(block).toMatch(/when not_null_violation then/);
    expect(block).toMatch(/branch=constraint_rejection column=/);
    expect(block).toMatch(/white_player_id/);
    expect(block).toMatch(/branch=rpc_exclusion both-seats predicate/);
    expect(block).toMatch(/when sqlstate 'SP001' then\s*\n\s*raise;/);
    expect(block).not.toMatch(/when others then[\s\S]*spv1_assert\([\s\S]*'missing white player'/);
  });

  test('no_first_move supports schema rejection and RPC exclusion branches', () => {
    const sql = readScript();
    expect(sql).toContain('no_first_move excluded via RPC void predicate');
    expect(sql).toContain('branch=rpc_exclusion storage reachable');
    expect(sql).toContain('no_first_move rejected by games_end_reason_check');
    expect(sql).toContain('branch=schema_rejection');
    expect(sql).not.toContain('DRIFT NOTE: games_end_reason_check not present');
  });

  test('constraint handlers re-raise SP001 and avoid catch-all pass conversion', () => {
    const sql = readScript();
    expect(sql).toMatch(/when check_violation then[\s\S]*when sqlstate 'SP001' then[\s\S]*raise;/);
    expect(sql).not.toMatch(
      /when others then\s*\r?\n\s*perform pg_temp\.spv1_assert\(\s*'[^']*',\s*'[^']*',\s*true,/,
    );
  });

  test('role discipline: owner capture, null guard, invoke_rpc, no postgres restore', () => {
    const sql = readScript();
    expect(sql).toContain("select set_config('spv1.owner_role', current_user, true)");
    expect(sql).toContain("coalesce(nullif(current_setting('spv1.owner_role', true), ''), current_user)");
    expect(sql).toContain('pg_temp.spv1_invoke_rpc(');
    expect(sql).not.toMatch(/set_config\('role', 'postgres'/i);
  });

  test('tournament isolation and cross-player counts A=2 B=12', () => {
    const sql = readScript();
    expect(sql).toContain('caller C sees exactly one tournament (t_b)');
    expect(sql).toContain('caller C does not see caller A tournament t_a');
    expect(sql).toContain('caller A sees exactly 2 bullet white 1+0 games');
    expect(sql).toContain('caller B sees exactly 12 bullet white 1+0 games');
    expect(sql).not.toContain('nonparticipant caller C sees zero tournaments');
    expect(sql).not.toContain('v_a_games > v_b_games');
  });

  test('schema preflight includes auth.users and games_play_context_check probe', () => {
    const sql = readScript();
    expect(sql).toContain("pg_temp.spv1_require_table('auth', 'users')");
    expect(sql).toContain('games_play_context_check');
  });

  test('games column preflight uses valid PL/pgSQL FOREACH array constructor', () => {
    const sql = readScript();
    const loopStart = sql.indexOf("perform pg_temp.spv1_require_table('public', 'games');");
    expect(loopStart).toBeGreaterThan(-1);
    const loopBlock = sql.slice(loopStart, sql.indexOf('select exists (', loopStart));
    expect(loopBlock).not.toMatch(/foreach\s+v_col\s+in\s+array\s+\[/);
    expect(loopBlock).toContain('foreach v_col in array array[');
    expect(loopBlock).toMatch(
      /foreach v_col in array array\[\s*'id', 'white_player_id', 'black_player_id'/,
    );
  });

  test('battlefield zero-game percentage uses JSON null equality not SQL IS NULL', () => {
    const sql = readScript();
    const blockStart = sql.indexOf(
      '-- BASELINE: zero-game absent cells + battlefield lifetime materialized',
    );
    const blockEnd = sql.indexOf('-- COMMON ELIGIBILITY EXCLUSIONS');
    expect(blockStart).toBeGreaterThan(-1);
    expect(blockEnd).toBeGreaterThan(blockStart);
    const block = sql.slice(blockStart, blockEnd);
    expect(block).toContain(
      "perform pg_temp.spv1_assert('battlefield', 'lifetime percentage null at zero'",
    );
    expect(block).not.toMatch(/->'percentage'\)\s+is\s+null/);
    expect(block).toMatch(/->'percentage'\)\s*=\s*'null'::jsonb/);
  });

  test('readiness doc documents Path B branch predictions', () => {
    const doc = readReadiness();
    expect(doc).toContain('Expected Path B local branches');
    expect(doc).toMatch(/no_first_move.*branch=rpc_exclusion/s);
    expect(doc).toMatch(/malformed result.*branch=rpc_exclusion/s);
    expect(doc).toMatch(/invalid `play_context`.*branch=rpc_exclusion/s);
    expect(doc).toMatch(/missing white player.*branch=constraint_rejection/s);
    expect(doc).toContain('Production catalog differences');
  });
});
