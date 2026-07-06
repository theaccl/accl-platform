import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260705120000_successful_performance_read_foundation.sql';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const OFFICIAL_LIVE_MAPPINGS: ReadonlyArray<[string, string]> = [
  ['1m', '1+0'],
  ['1+1', '1+1'],
  ['2m', '2+0'],
  ['2+0', '2+0'],
  ['2+1', '2+1'],
  ['3m', '3+0'],
  ['3+2', '3+2'],
  ['5m', '5+0'],
  ['5+5', '5+5'],
  ['10m', '10+0'],
  ['15m', '15+0'],
  ['30m', '30+0'],
  ['60m', '60+0'],
];

const OFFICIAL_DAILY_MAPPINGS: ReadonlyArray<[string, string]> = [
  ['1d', '1d'],
  ['2d', '2d'],
  ['3d', '3d'],
  ['7d', '7d'],
];

function readMigration(): string {
  return readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8');
}

function sliceBetween(sql: string, start: string, end: string): string {
  const a = sql.indexOf(start);
  const b = sql.indexOf(end, a);
  return sql.slice(a, b === -1 ? undefined : b);
}

function mainRpcBlock(sql: string): string {
  return sliceBetween(sql, 'function public.get_own_successful_performance()', 'comment on function public.get_own_successful_performance');
}

function strictControlBlock(sql: string): string {
  return sliceBetween(sql, 'function public.successful_performance_strict_control', 'comment on function public.successful_performance_strict_control');
}

test.describe('successfulPerformanceReadMigration (static)', () => {
  test('migration file exists and sorts after O1 bucket foundation', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toContain(MIGRATION);
    expect(MIGRATION > '20260625120000').toBe(true);
  });

  test('no duplicate migration basename', () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((n) =>
      n.includes('successful_performance_read_foundation'),
    );
    expect(names).toEqual([MIGRATION]);
  });

  test('wraps DDL in explicit transaction (begin/commit)', () => {
    const sql = readMigration();
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
  });

  test('uses CREATE FUNCTION for new RPC (not silent replace)', () => {
    const sql = readMigration();
    expect(sql).toMatch(/create function public\.get_own_successful_performance\(\)/i);
    expect(sql).not.toMatch(/create or replace function public\.get_own_successful_performance/i);
  });

  test('main RPC: no subject parameter; identity from auth.uid() only', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toMatch(/function public\.get_own_successful_performance\(\)/i);
    expect(block).toContain('v_uid uuid := auth.uid()');
    expect(block).toContain("raise exception 'not_authenticated'");
    expect(block).not.toMatch(/\bp_player_id\b|\bp_subject\b/i);
  });

  test('main RPC: SECURITY DEFINER STABLE with pg_catalog, pg_temp search_path', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/\bstable\b/i);
    expect(block).toContain('set search_path = pg_catalog, pg_temp');
    expect(block).not.toMatch(/set\s+search_path\s*=\s*pg_catalog,\s*public/i);
  });

  test('authorization: revoke PUBLIC and anon; grant authenticated only', () => {
    const sql = readMigration();
    expect(sql).toContain('revoke all on function public.get_own_successful_performance() from public');
    expect(sql).toContain('revoke all on function public.get_own_successful_performance() from anon');
    expect(sql).toContain('grant execute on function public.get_own_successful_performance() to authenticated');
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.get_own_successful_performance\(\)\s+to\s+anon/i);
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.get_own_successful_performance\(\)\s+to\s+service_role/i);
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.get_own_successful_performance\(\)\s+to\s+public/i);
  });

  test('internal helpers revoked from PUBLIC', () => {
    const sql = readMigration();
    expect(sql).toContain('revoke all on function public.successful_performance_strict_control(text, text) from public');
    expect(sql).toContain('revoke all on function public.successful_performance_mode_from_control(text) from public');
    expect(sql).toContain('revoke all on function public.successful_performance_player_outcome(text, uuid, uuid, uuid) from public');
  });

  test('partial indexes on finished rated white and black player columns', () => {
    const sql = readMigration();
    expect(sql).toContain('games_finished_rated_white_player_idx');
    expect(sql).toContain('games_finished_rated_black_player_idx');
    expect(sql).toContain('on public.games (white_player_id)');
    expect(sql).toContain('on public.games (black_player_id)');
    expect(sql).toMatch(/where status = 'finished'\s*\n\s*and rated is true/i);
  });

  test('common eligibility: finished rated seated distinct participant with move log EXISTS', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toContain("g.status = 'finished'");
    expect(block).toContain('g.rated is true');
    expect(block).toContain('g.white_player_id is not null');
    expect(block).toContain('g.black_player_id is not null');
    expect(block).toContain('g.white_player_id <> g.black_player_id');
    expect(block).toContain('g.white_player_id = v_uid or g.black_player_id = v_uid');
    expect(block).toContain("lower(btrim(coalesce(g.source_type, ''))) <> 'bot_game'");
    expect(block).toContain('g.bot_settings is null');
    expect(block).toContain("in ('white_win', 'black_win', 'draw')");
    expect(block).not.toContain("'1/2-1/2'");
    expect(block).toContain('exists (');
    expect(block).toContain('from public.game_move_logs ml');
    expect(block).toContain('where ml.game_id = g.id');
    expect(block).not.toMatch(/count\s*\(\s*\*\s*\)\s*from\s+public\.game_move_logs/i);
  });

  test('common eligibility: excludes lifecycle void end reasons including no_first_move parity', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toContain("'superseded'");
    expect(block).toContain("'expired_open_seat'");
    expect(block).toContain("'abandoned_before_move'");
    expect(block).toContain("'no_first_move'");
    expect(block).toMatch(/no_first_move.*parity with engine void semantics/i);
  });

  test('common eligibility: does not require rating_applied', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).not.toMatch(/rating_applied/i);
  });

  test('free-play lane: play_context free, tournament_id null, strict control required', () => {
    const block = mainRpcBlock(readMigration());
    const freeLane = sliceBetween(block, 'free_eligible as', 'exact_stats as');
    expect(freeLane).toContain("ce.play_context_norm = 'free'");
    expect(freeLane).toContain('ce.tournament_id is null');
    expect(freeLane).toContain('ce.strict_control is not null');
  });

  test('tournament lane: play_context tournament, tournament_id not null; no live_time_control gate', () => {
    const block = mainRpcBlock(readMigration());
    const tourneyLane = sliceBetween(block, 'tournament_eligible as', 'tournament_stats as');
    expect(tourneyLane).toContain("ce.play_context_norm = 'tournament'");
    expect(tourneyLane).toContain('ce.tournament_id is not null');
    expect(tourneyLane).not.toMatch(/live_time_control/i);
  });

  test('play_context normalization: null/empty maps to free', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toContain("when g.play_context is null or btrim(g.play_context) = '' then 'free'");
  });

  test('strict classifier: all 16 official live and daily mappings', () => {
    const block = strictControlBlock(readMigration());
    for (const [from, to] of OFFICIAL_LIVE_MAPPINGS) {
      expect(block).toContain(`when '${from}' then '${to}'`);
    }
    for (const [from, to] of OFFICIAL_DAILY_MAPPINGS) {
      expect(block).toContain(`when '${from}' then '${to}'`);
    }
  });

  test('strict classifier: rejects legacy and mismatch controls', () => {
    const sql = readMigration();
    const block = strictControlBlock(sql);
    expect(block).toContain("v_ltc in ('20m', '5d', '5m+3s')");
    expect(block).toContain("v_tempo in ('daily', 'correspondence') and v_ltc ~ 'm$'");
    expect(block).toContain("v_tempo = 'live' and v_ltc ~ 'd$'");
    expect(block).toContain("if v_ltc = '' then");
    expect(sql).toContain('stricter than legacy rating/badge classifiers');
  });

  test('strict classifier: 2m and 2+0 both map to 2+0', () => {
    const block = strictControlBlock(readMigration());
    expect(block).toContain("when '2m' then '2+0'");
    expect(block).toContain("when '2+0' then '2+0'");
  });

  test('broad mode groups cover bullet blitz rapid daily exact sets', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toContain("when 'bullet' then array['1+0', '1+1', '2+0', '2+1']");
    expect(block).toContain("when 'blitz' then array['3+0', '3+2', '5+0', '5+5']");
    expect(block).toContain("when 'rapid' then array['10+0', '15+0', '30+0', '60+0']");
    expect(block).toContain("when 'daily' then array['1d', '2d', '3d', '7d']");
  });

  test('scoring: win draw loss points and separate white/black color tracking', () => {
    const sql = readMigration();
    const outcomeBlock = sliceBetween(
      sql,
      'function public.successful_performance_player_outcome',
      'create function public.get_own_successful_performance',
    );
    const block = mainRpcBlock(sql);
    expect(outcomeBlock).toContain("when 'draw' then 'draw'");
    expect(outcomeBlock).toContain("when 'white_win' then case when p_player_id = p_white_id then 'win' else 'loss' end");
    expect(outcomeBlock).toContain("when 'black_win' then case when p_player_id = p_black_id then 'win' else 'loss' end");
    expect(block).toContain("count(*) filter (where fe.outcome = 'win')");
    expect(block).toContain("count(*) filter (where fe.outcome = 'draw')");
    expect(block).toContain("count(*) filter (where fe.outcome = 'loss')");
    expect(block).toContain("0.5 * count(*) filter (where fe.outcome = 'draw')");
    expect(block).toContain("when g.white_player_id = v_uid then 'white' else 'black' end as player_color");
  });

  test('unlocks: exact threshold 10; broad 100 or all-four-controls route', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toContain("'unlocked', es.games >= 10");
    expect(block).toContain('ms.games >= 100');
    expect(block).toContain('select count(*) = 4');
    expect(block).toContain('and euf.unlocked');
    expect(block).not.toContain('es.games > 10');
    expect(block).not.toContain('ms.games > 100');
  });

  test('unlock boundaries: 9 below, 10 at, 11 above exact; 99 below and 100 at broad count path', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toMatch(/es\.games\s*>=\s*10/);
    expect(block).toMatch(/ms\.games\s*>=\s*100/);
    expect(block).not.toMatch(/es\.games\s*>\s*10/);
    expect(block).not.toMatch(/ms\.games\s*>\s*100/);
  });

  test('common eligibility exclusions: unrated bot open-seat self-play nonparticipant invalid context', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toContain('g.rated is true');
    expect(block).toContain("lower(btrim(coalesce(g.source_type, ''))) <> 'bot_game'");
    expect(block).toContain('g.bot_settings is null');
    expect(block).toContain("'expired_open_seat'");
    expect(block).toContain('g.white_player_id <> g.black_player_id');
    expect(block).toContain('g.white_player_id = v_uid or g.black_player_id = v_uid');
    expect(block).toContain("ce.play_context_norm = 'free'");
    expect(block).toContain("ce.play_context_norm = 'tournament'");
    expect(block).not.toContain("'1/2-1/2'");
  });

  test('battlefield: lifetime always present with unlocked true; tournaments keyed by tournament_id', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toContain("'scope', 'battlefield'");
    expect(block).toContain("'unlocked', true");
    expect(block).toContain("'scope', 'tournament'");
    expect(block).toContain("'tournament_id', ts.tournament_id");
    expect(block).toContain("'color', 'combined'");
  });

  test('response envelope: contract_version and aggregate-only fields', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).toContain("'contract_version', 'successful_performance_v1'");
    expect(block).toContain("'free_play'");
    expect(block).toContain("'exact_controls'");
    expect(block).toContain("'battlefield'");
    expect(block).toContain("'eligible_games'");
    expect(block).toContain("'percentage'");
    expect(block).toContain("'score'");
    expect(block).toContain("'source_status'");
  });

  test('response privacy: no game IDs opponent IDs or per-game timestamps in JSON builder', () => {
    const block = mainRpcBlock(readMigration());
    expect(block).not.toMatch(/'game_id'|'opponent_id'|'white_player_id'|'black_player_id'|'finished_at'|'created_at'|'updated_at'/i);
    expect(block).not.toMatch(/jsonb_agg\s*\(\s*g\./i);
  });

  test('cross-player isolation: no forgeable player UUID parameter on public RPC', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/create function public\.get_own_successful_performance\s*\(\s*uuid/i);
    expect(sql).not.toMatch(/create function public\.get_own_successful_performance\s*\(\s*text/i);
  });

  test('does not add ledger materialized aggregate or alter rating/settlement paths', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/player_rating_history_ledger|materialized view|apply_free_play_rating|apply_tournament_rating|settlement/i);
    expect(sql).not.toMatch(/create trigger|alter table public\.games/i);
  });
});
