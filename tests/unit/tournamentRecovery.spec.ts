import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

import { precheckBracketPersist } from '@/lib/tournamentPersist';
import { matchBoardStatus } from '@/lib/tournamentReadModel';

test.describe('Phase 1 — tournament recovery / interrupted flow (unit)', () => {
  test('persist precheck idempotent when matches exist on active tournament', () => {
    expect(precheckBracketPersist('active', 3)).toEqual({ action: 'idempotent_return' });
    expect(precheckBracketPersist('pending', 3)).toEqual({
      action: 'reject',
      code: 'incomplete',
      detail: expect.stringContaining('pending'),
    });
  });

  test('spawn and bootstrap guards prevent duplicate games (migration)', () => {
    const sql = readFileSync(
      'supabase/migrations/20260408120000_tournament_integrity_hardening.sql',
      'utf8',
    );
    expect(sql).toContain('tournament_matches_game_id_unique');
    expect(sql).toContain('if m.game_id is not null or m.winner_id is not null then');
    expect(sql).toContain('tournament_bootstrap_round');
    expect(sql).toMatch(/if m\.game_id is not null/);
  });

  test('matchBoardStatus distinguishes partial round states', () => {
    expect(
      matchBoardStatus(
        { player1_id: 'a', player2_id: 'b', winner_id: 'a', game_id: 'g1' },
        'finished',
      ),
    ).toBe('resolved');
    expect(
      matchBoardStatus(
        { player1_id: 'a', player2_id: 'b', winner_id: null, game_id: 'g2' },
        'active',
      ),
    ).toBe('live');
  });

  test('verification script documents no automatic recovery', () => {
    const src = readFileSync('scripts/tournament-recovery-verification.mjs', 'utf8');
    expect(src).toContain('partial round');
    expect(src).toContain('tournament_bootstrap_round');
    expect(src).toContain('automatic_recovery: false');
    expect(src).toContain('loadRecoveryFingerprint');
  });

  test('tournament snapshot read model is service-role hub (not live FEN)', () => {
    const src = readFileSync('lib/server/tournamentSnapshotReadModel.ts', 'utf8');
    expect(src).toContain('buildTournamentSnapshot');
    expect(src).toContain('gameStatusById');
  });
});
