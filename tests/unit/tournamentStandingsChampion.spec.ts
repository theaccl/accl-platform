import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

import {
  championUserIdFromTournament,
  findFinalMatch,
  matchBoardStatus,
} from '@/lib/tournamentReadModel';

test.describe('Phase 1 — tournament standings + champion (unit)', () => {
  test('champion derived only when completed and final has winner', () => {
    const matches = [
      {
        round_number: 1,
        match_number: 0,
        player1_id: 'a',
        player2_id: 'd',
        game_id: 'g1',
        winner_id: 'a',
        next_match_id: 'f',
      },
      {
        round_number: 1,
        match_number: 1,
        player1_id: 'b',
        player2_id: 'c',
        game_id: 'g2',
        winner_id: 'b',
        next_match_id: 'f',
      },
      {
        id: 'f',
        round_number: 2,
        match_number: 0,
        player1_id: 'a',
        player2_id: 'b',
        game_id: 'gf',
        winner_id: 'b',
        next_match_id: null,
      },
    ];
    expect(championUserIdFromTournament('active', matches)).toBeNull();
    expect(championUserIdFromTournament('completed', matches)).toBe('b');
    expect(findFinalMatch(matches)?.winner_id).toBe('b');
  });

  test('matchBoardStatus covers partial bracket states', () => {
    expect(
      matchBoardStatus(
        { player1_id: 'a', player2_id: 'b', winner_id: 'a', game_id: 'g' },
        'finished',
      ),
    ).toBe('resolved');
    expect(
      matchBoardStatus({ player1_id: 'a', player2_id: 'b', winner_id: null, game_id: 'g' }, 'active'),
    ).toBe('live');
    expect(
      matchBoardStatus({ player1_id: 'a', player2_id: null, winner_id: null, game_id: null }, null),
    ).toBe('waiting');
    expect(
      matchBoardStatus({ player1_id: 'a', player2_id: 'b', winner_id: null, game_id: null }, null),
    ).toBe('ready');
  });

  test('snapshot read model has no rating or free-play fields', () => {
    const src = readFileSync('lib/server/tournamentSnapshotReadModel.ts', 'utf8');
    expect(src).toContain('buildTournamentSnapshot');
    expect(src).toContain('gameStatusById');
    expect(src).not.toContain('player_ratings');
    expect(src).not.toContain('elo');
  });

  test('tournament hub derives champion via read-model helper', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'tournaments', '[id]', 'page.tsx'), 'utf8');
    expect(src).toContain('championUserIdFromTournament');
    expect(src).toContain('data-testid="tournament-champion-banner"');
    expect(src).toContain('data-testid="tournament-start-button"');
    expect(src).toContain('data-testid="tournament-your-match-ready"');
  });

  test('verification script documents read-model-only scope', () => {
    const src = readFileSync('scripts/tournament-standings-champion-verification.mjs', 'utf8');
    expect(src).toContain('trophy_emitter_in_scope: false');
    expect(src).toContain('rating_recalc_in_scope: false');
    expect(src).toContain('championUserIdFromTournament');
  });
});
