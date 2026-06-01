import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260620140000_free_play_daily_concurrency_authority.sql';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const SECURITY_DEFINER_FUNCTIONS = [
  'free_play_count_rated_daily_obligations',
  'free_play_count_unrated_daily_waiting_seats',
  'free_play_rated_daily_obligation_participants',
  'free_play_unrated_daily_waiting_host',
  'free_play_assert_daily_cap',
  'trg_games_enforce_free_daily_concurrency',
] as const;

function readMigration(): string {
  return readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8');
}

function sliceBetween(sql: string, start: string, end: string): string {
  const a = sql.indexOf(start);
  const b = sql.indexOf(end, a);
  return sql.slice(a, b === -1 ? undefined : b);
}

test.describe('freePlayDailyConcurrencyAuthorityMigration (static)', () => {
  test('migration file exists and sorts after seated-live block', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toContain(MIGRATION);
    expect(MIGRATION > '20260620120000_free_play_block_new_live_seat_while_seated_live.sql').toBe(true);
  });

  test('wraps DDL in explicit transaction (begin/commit)', () => {
    const sql = readMigration();
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
  });

  test('every SECURITY DEFINER function uses pg_catalog, pg_temp only (no public in search_path)', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/set\s+search_path\s*=\s*pg_catalog,\s*public/i);
    for (const fn of SECURITY_DEFINER_FUNCTIONS) {
      const block = sliceBetween(sql, `function public.${fn}`, '$$;');
      expect(block, fn).toMatch(/security definer/i);
      expect(block, fn).toContain('set search_path = pg_catalog, pg_temp');
    }
  });

  test('every public.games reference and public helper call is schema-qualified', () => {
    const sql = readMigration();
    expect(sql).toContain('from public.games');
    expect(sql).toContain('on public.games');
    const ddl = sql.replace(/--[^\n]*/g, '');
    expect(ddl).not.toMatch(/\bfrom\s+games\b/i);
    expect(ddl).not.toMatch(/\bon\s+games\b/i);
    expect(ddl).not.toMatch(/\bjoin\s+games\b/i);
    expect(sql).toContain('public.free_play_count_rated_daily_obligations');
    expect(sql).toContain('public.free_play_count_unrated_daily_waiting_seats');
    expect(sql).toContain('public.free_play_rated_daily_obligation_participants');
    expect(sql).toContain('public.free_play_unrated_daily_waiting_host');
    expect(sql).toContain('public.free_play_assert_daily_cap');
  });

  test('count helpers are STABLE PARALLEL SAFE', () => {
    const sql = readMigration();
    for (const fn of ['free_play_count_rated_daily_obligations', 'free_play_count_unrated_daily_waiting_seats']) {
      const block = sliceBetween(sql, `function public.${fn}`, '$$;');
      expect(block).toMatch(/\bstable\b/i);
      expect(block).toMatch(/parallel safe/i);
      expect(block).not.toMatch(/\bvolatile\b/i);
    }
  });

  test('assertion helper is VOLATILE PARALLEL UNSAFE with hashtextextended xact lock', () => {
    const sql = readMigration();
    const block = sliceBetween(sql, 'function public.free_play_assert_daily_cap', '$$;');
    expect(block).toMatch(/\bvolatile\b/i);
    expect(block).toMatch(/parallel unsafe/i);
    expect(block).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(block).toContain("pg_catalog.hashtextextended('free_daily_cap:' || p_uid::text, 0)");
    expect(block.indexOf('pg_advisory_xact_lock')).toBeLessThan(
      block.indexOf('free_play_count_rated_daily_obligations'),
    );
    expect(block).toContain("raise exception 'free_play_daily_rated_cap'");
    expect(block).toContain("raise exception 'free_play_daily_unrated_waiting_cap'");
  });

  test('assert_daily_cap fails closed unless transaction_isolation is read committed', () => {
    const block = sliceBetween(readMigration(), 'function public.free_play_assert_daily_cap', '$$;');
    expect(block).toContain("current_setting('transaction_isolation')");
    expect(block).toContain("raise exception 'free_play_daily_requires_read_committed'");
    expect(block.indexOf('free_play_daily_requires_read_committed')).toBeLessThan(
      block.indexOf('pg_advisory_xact_lock'),
    );
  });

  test('every free-play classification surface normalizes play_context', () => {
    const sql = readMigration();
    expect(sql).toContain("lower(btrim(coalesce(g.play_context, ''))) = 'free'");
    expect(sql).toMatch(/lower\(btrim\(coalesce\(p_play_context, ''\)\)\)\s*<>\s*'free'/);
    expect(sql).toContain("lower(btrim(coalesce(new.play_context, ''))) <> 'free'");
    expect(sql).toContain("lower(btrim(coalesce(old.play_context, ''))) <> 'free'");
    const unrated = sliceBetween(sql, 'free_play_count_unrated_daily_waiting_seats', 'comment on function');
    expect(unrated).toContain("lower(btrim(coalesce(g.play_context, ''))) = 'free'");
  });

  test('trigger function is VOLATILE PARALLEL UNSAFE', () => {
    const sql = readMigration();
    const block = sliceBetween(sql, 'function public.trg_games_enforce_free_daily_concurrency', '$$;');
    expect(block).toMatch(/\bvolatile\b/i);
    expect(block).toMatch(/parallel unsafe/i);
    expect(sql).toContain('create trigger trg_games_enforce_free_daily_concurrency');
    expect(sql).toContain('before insert or update on public.games');
  });

  test('rated count is global daily tempo without official-token-only filter', () => {
    const fn = sliceBetween(
      readMigration(),
      'free_play_count_rated_daily_obligations',
      'free_play_count_unrated_daily_waiting_seats',
    );
    expect(fn).toContain("lower(btrim(coalesce(g.tempo, ''))) = 'daily'");
    expect(fn).not.toMatch(/live_time_control\s+in\s*\(/i);
    expect(fn).toContain("in ('active', 'waiting')");
    expect(fn).not.toContain("'finished'");
    expect(fn).not.toContain("'void'");
    expect(fn).not.toMatch(/end_reason/i);
    expect(fn).toContain("lower(btrim(coalesce(g.play_context, ''))) = 'free'");
  });

  test('obligation counts use status only; neutral end_reason on active/waiting still counts', () => {
    const sql = readMigration();
    const ddl = sql.replace(/--[^\n]*/g, '');
    expect(ddl).not.toMatch(/abandoned_before_move|'superseded'/i);
    const ratedHelper = sliceBetween(sql, 'free_play_rated_daily_obligation_participants', 'free_play_unrated_daily_waiting_host');
    expect(ratedHelper).not.toMatch(/coalesce\(p_end_reason/i);
  });

  test('unrated queue count is host-only open seats', () => {
    const fn = sliceBetween(
      readMigration(),
      'free_play_count_unrated_daily_waiting_seats',
      'comment on function public.free_play_count_unrated_daily_waiting_seats',
    );
    expect(fn).toContain('g.white_player_id = p_uid');
    expect(fn).toContain('g.black_player_id is null');
    expect(fn).toContain("coalesce(g.rated, false) = false");
  });

  test('trigger uses rated set-difference, ascending order, and per-UUID assert loop', () => {
    const trg = sliceBetween(
      readMigration(),
      'trg_games_enforce_free_daily_concurrency()',
      'comment on function public.trg_games_enforce_free_daily_concurrency',
    );
    expect(trg).toContain('array_agg(distinct np order by np)');
    expect(trg).toContain('where not (np = any (coalesce(old_rated_parts');
    expect(trg).toContain('foreach u in array added_rated_parts');
    expect(trg).toContain("perform public.free_play_assert_daily_cap(u, 'rated')");
  });

  test('rated obligation helper returns both seated participants (direct two-player insert)', () => {
    const block = sliceBetween(
      readMigration(),
      'free_play_rated_daily_obligation_participants',
      'free_play_unrated_daily_waiting_host',
    );
    expect(block).toContain('array[p_white_player_id, p_black_player_id]');
  });

  test('row-state helpers are IMMUTABLE PARALLEL SAFE', () => {
    const sql = readMigration();
    for (const fn of ['free_play_rated_daily_obligation_participants', 'free_play_unrated_daily_waiting_host']) {
      const block = sliceBetween(sql, `function public.${fn}`, '$$;');
      expect(block).toMatch(/\bimmutable\b/i);
      expect(block).toMatch(/parallel safe/i);
    }
  });

  test('NULL → Black rated seating asserts via set-difference (not direct NEW.white assert)', () => {
    const trg = sliceBetween(
      readMigration(),
      'trg_games_enforce_free_daily_concurrency()',
      'comment on function public.trg_games_enforce_free_daily_concurrency',
    );
    expect(trg).not.toContain('free_play_assert_daily_cap(new.white_player_id');
    expect(trg).toContain('old_rated_parts');
    expect(trg).toContain('new_rated_parts');
  });

  test('unrated accept: host distinct check skips waiting cap when seat becomes seated', () => {
    const trg = sliceBetween(
      readMigration(),
      'trg_games_enforce_free_daily_concurrency()',
      'comment on function public.trg_games_enforce_free_daily_concurrency',
    );
    expect(trg).toMatch(
      /new_waiting_host is not null[\s\S]*old_waiting_host is null or new_waiting_host is distinct/,
    );
  });

  test('obligation helpers and trigger omit fen/pgn/clock columns', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/\.fen\b|\.pgn\b|white_clock|black_clock|last_move_at/i);
  });

  test('tournament and non-free NEW rows fast-path out', () => {
    const trg = sliceBetween(
      readMigration(),
      'trg_games_enforce_free_daily_concurrency()',
      'comment on function public.trg_games_enforce_free_daily_concurrency',
    );
    expect(trg).toContain("lower(btrim(coalesce(new.play_context, ''))) <> 'free'");
    expect(trg).toContain('new.tournament_id is not null');
    expect(trg).toContain('return new');
  });

  test('privilege closure: REVOKE PUBLIC on all new functions; no direct client GRANTs', () => {
    const sql = readMigration();
    for (const fn of SECURITY_DEFINER_FUNCTIONS) {
      expect(sql).toContain(`revoke all on function public.${fn}`);
    }
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.free_play_/i);
    expect(sql).not.toContain('grant execute on function public.free_play_assert_daily_cap');
    expect(sql).not.toContain('grant execute on function public.trg_games_enforce_free_daily_concurrency');
  });

  test('does not replace live-seat RLS or create_seated_game_guard definitions', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.auth_free_play_blocks_new_open_seat/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.create_seated_game_guard/i);
    expect(sql).not.toContain('free_play_player_already_seated');
  });

  test('footer follow-up marker ACCL_OPEN_SEAT_RAW_UPDATE_AUTHORITY_HARDENING_REQUIRED', () => {
    const sql = readMigration();
    expect(sql).toContain('ACCL_OPEN_SEAT_RAW_UPDATE_AUTHORITY_HARDENING_REQUIRED');
    expect(sql).toContain('does not alter live-seat');
  });

  test('BEFORE UPDATE enables raw PATCH rated Daily cap path via trigger', () => {
    expect(readMigration()).toContain('before insert or update on public.games');
  });
});
