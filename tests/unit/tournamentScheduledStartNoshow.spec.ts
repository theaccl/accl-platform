import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test.describe('Phase 1 — scheduled start + no-show grace (unit)', () => {
  test('additive migration defines tournaments.starts_at', () => {
    const sql = readFileSync(
      'supabase/migrations/20260519165000_tournament_starts_at_additive.sql',
      'utf8',
    );
    expect(sql).toContain('starts_at timestamptz');
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(sql).not.toMatch(/create\s+trigger/i);
  });

  test('app create route does not enforce starts_at yet', () => {
    const src = readFileSync('app/api/internal/tournaments/create/route.ts', 'utf8');
    expect(src).not.toContain('starts_at');
  });

  test('tournament snapshot read model omits starts_at', () => {
    const src = readFileSync('lib/server/tournamentSnapshotReadModel.ts', 'utf8');
    expect(src).not.toContain('starts_at');
  });

  test('verification script documents no check-in and no auto-forfeit', () => {
    const src = readFileSync('scripts/tournament-scheduled-start-noshow-verification.mjs', 'utf8');
    expect(src).toContain('NOSHOW_GRACE_SEC');
    expect(src).toContain('check_in_signal: false');
    expect(src).toContain('auto_forfeit: false');
  });
});
