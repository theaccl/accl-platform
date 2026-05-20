import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test.describe('Phase 1 — multi-tournament concurrency (unit)', () => {
  test('spawn migration sets games.tournament_id from parent tournament', () => {
    const sql = readFileSync(
      'supabase/migrations/20260515180000_tournament_try_spawn_game_ecosystem_scope.sql',
      'utf8',
    );
    expect(sql).toContain('tournament_id');
    expect(sql).toContain("play_context");
    expect(sql).toContain("if m.game_id is not null");
  });

  test('tournament_bootstrap_round scopes by p_tournament_id (migration)', () => {
    const sql = readFileSync(
      'supabase/migrations/20260408120000_tournament_integrity_hardening.sql',
      'utf8',
    );
    expect(sql).toContain('where tournament_id = p_tournament_id');
    expect(sql).toContain('tournament_matches_game_id_unique');
  });

  test('free busy query excludes tournament rows (lib contract)', () => {
    const src = readFileSync('lib/hasActiveWaitingLiveFreeGame.ts', 'utf8');
    expect(src).toContain(".eq('play_context', 'free')");
    expect(src).toContain(".is('tournament_id', null)");
  });

  test('snapshot read model loads matches by tournament id', () => {
    const src = readFileSync('lib/server/tournamentSnapshotReadModel.ts', 'utf8');
    expect(src).toContain('.eq(\'tournament_id\', tournamentId)');
  });

  test('verification script documents isolation boundaries', () => {
    const src = readFileSync('scripts/tournament-multi-concurrency-verification.mjs', 'utf8');
    expect(src).toContain('distributed_recovery: false');
    expect(src).toContain('spectate cross-leak');
    expect(src).toContain('MULTI_INCLUDE_8P');
    expect(src).toContain('tournamentFingerprint');
  });
});
