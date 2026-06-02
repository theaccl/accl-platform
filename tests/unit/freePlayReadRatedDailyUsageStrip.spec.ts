import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260622140000_free_play_rated_daily_ticket_ledger_phase_a_foundation.sql';

function readMigration(): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
}

function rpcBlock(sql: string): string {
  const start = sql.indexOf('create or replace function public.free_play_read_rated_daily_usage_strip');
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end === -1 ? undefined : end + 3);
}

test.describe('freePlayReadRatedDailyUsageStrip (static)', () => {
  test('RPC returns structured free and paid payload branches', () => {
    const block = rpcBlock(readMigration());
    expect(block).toContain("'today_allowance', 5");
    expect(block).toContain("'today_queue_allowance', v_today_queue_allowance");
    expect(block).toContain("'acceptance_unlimited', true");
    expect(block).toContain("'legacy_unclassified_rated_daily_count'");
  });

  test('free default allowance is 5 and paid queue allowance is 10', () => {
    const block = rpcBlock(readMigration());
    expect(block).toContain("v_today_queue_allowance integer := 10");
    expect(block).toContain("v_pending_cap integer := 5");
    expect(block).toContain('v_pending_cap := 10');
  });

  test('today lane uses current UTC day; carryover uses yesterday with expiry filter', () => {
    const block = rpcBlock(readMigration());
    expect(block).toContain("v_utc_day date := (timezone('UTC', now()))::date");
    expect(block).toContain('v_yesterday date := v_utc_day - 1');
    expect(block).toContain('m.origin_utc_day = v_utc_day');
    expect(block).toContain('m.origin_utc_day = v_yesterday');
    expect(block).toContain('m.expires_at > now()');
  });

  test('does not store or read lane column; shelf helper uses origin_utc_day + 2', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/\bqueue_lane\s+(text|varchar)/i);
    expect(sql).toContain('free_play_rated_daily_shelf_expires_at');
    expect(sql).toContain('p_origin_utc_day + 2');
  });

  test('ongoing seated count requires black_player_id and active/waiting status', () => {
    const block = rpcBlock(readMigration());
    expect(block).toContain('g.black_player_id is not null');
    expect(block).toContain("lower(btrim(coalesce(g.tempo, ''))) = 'daily'");
    expect(block).toContain("lower(btrim(coalesce(g.status, ''))) in ('active', 'waiting')");
  });

  test('pending challenge cap switches between 5 and 10 by entitlement', () => {
    const block = rpcBlock(readMigration());
    expect(block).toContain("mr.from_user_id = v_uid");
    expect(block).toContain("coalesce(mr.rated, false) = true");
    expect(block).toContain("'pending_sent_rated_daily_challenge_cap', v_pending_cap");
  });

  test('legacy unclassified rows are explicit not guessed', () => {
    const block = rpcBlock(readMigration());
    expect(block).toContain('v_legacy_unclassified := greatest(0, v_total_obligations - v_classified)');
    expect(block).not.toContain('coalesce(v_legacy_unclassified, 0)');
  });

  test('caller may only read own snapshot unless service_role', () => {
    const block = rpcBlock(readMigration());
    expect(block).toContain('auth.uid()');
    expect(block).toContain("'service_role'");
    expect(block).toContain("raise exception 'forbidden'");
  });

  test('free position dots use explicit ledger mode when active ledger rows exist', () => {
    const block = rpcBlock(readMigration());
    expect(block).toContain('if v_ledger_waiting > 0 or v_ledger_committed > 0 then');
    expect(block).toContain('v_state := null;');
    expect(block).toContain('and l.position_no = v_i');
    expect(block).toContain("v_state := coalesce(v_state, 'empty');");
    expect(block).not.toContain('v_committed_assigned');
    expect(block).not.toContain('v_waiting_assigned');
  });

  test('free position dots use metadata-only fallback only when ledger counts are zero', () => {
    const block = rpcBlock(readMigration());
    const elseIdx = block.indexOf('else');
    const endIfIdx = block.indexOf('end if;', elseIdx);
    expect(elseIdx).toBeGreaterThan(-1);
    expect(endIfIdx).toBeGreaterThan(elseIdx);
    const fallbackBlock = block.slice(elseIdx, endIfIdx);
    expect(fallbackBlock).toContain("when v_i <= v_today_waiting then 'waiting'");
    expect(fallbackBlock).toContain("else 'empty'");
    expect(fallbackBlock).not.toContain("'committed'");
    expect(fallbackBlock).not.toContain('v_committed_assigned');
    expect(fallbackBlock).not.toContain('v_waiting_assigned');
  });
});
