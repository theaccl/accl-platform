import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260621120000_reconcile_legacy_duplicate_migration_versions.sql';

function readMigration(): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
}

test.describe('legacyDuplicateMigrationReconciliation (static)', () => {
  test('reconciliation migration exists with legacy collision documentation', () => {
    const sql = readMigration();
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
    expect(sql).toContain('20260425120000');
    expect(sql).toContain('20260519120000');
    expect(sql).toContain('20260530140000');
    expect(sql).toContain('editable_profile_identity.sql');
    expect(sql).toContain('expand_match_requests_live_time_control_check.sql');
    expect(sql).toContain('realtime_tester_chat_dm.sql');
    expect(sql).toContain('tester_bug_reports_game_context.sql');
    expect(sql).toContain('apply_move_transactional_move_log.sql');
    expect(sql).toContain('supabase_security_advisor_remaining_red.sql');
    expect(sql).toContain('14-digit version');
    expect(sql).toContain('20260622140000');
  });

  test('creates missing tester_bug_reports partial index', () => {
    const sql = readMigration();
    expect(sql).toContain('create index if not exists tester_bug_reports_game_id_idx');
    expect(sql).toContain('where game_id is not null');
  });

  test('reconciles match_requests live_time_control_check with canonical tokens', () => {
    const sql = readMigration();
    expect(sql).toContain('match_requests_live_time_control_check');
    expect(sql).toContain("'2+0'");
    expect(sql).toContain("'5d'");
    expect(sql).toContain("'7d'");
    expect(sql).toContain("'5m+5'");
  });

  test('reconciles public_growth_events RLS hardening', () => {
    const sql = readMigration();
    expect(sql).toContain('alter table public.public_growth_events enable row level security');
    expect(sql).toContain('public_growth_events_deny_authenticated');
    expect(sql).toContain('public_growth_events_deny_anon');
    expect(sql).toContain('public_growth_events_service_role_all');
  });

  test('does not replay unsafe realtime publication or profile RPC changes', () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/alter\s+publication\s+supabase_realtime/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.update_own_profile_identity/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.apply_move_and_maybe_finish_system/i);
    expect(sql).not.toContain('free_play_rated_daily');
  });
});
