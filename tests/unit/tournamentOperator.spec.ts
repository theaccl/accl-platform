import { test, expect } from '@playwright/test';

import {
  isTournamentBracketFull,
  orderedUserIdsFromTournamentEntries,
  tournamentBracketTargetSize,
  tournamentPhaseStatus,
  tournamentPhaseStatusLabel,
} from '@/lib/server/tournamentOperator';

test.describe('tournament operator helpers (unit)', () => {
  test('bracket target size is next power of 2 capped at 8', () => {
    expect(tournamentBracketTargetSize(0)).toBe(2);
    expect(tournamentBracketTargetSize(1)).toBe(2);
    expect(tournamentBracketTargetSize(2)).toBe(2);
    expect(tournamentBracketTargetSize(3)).toBe(4);
    expect(tournamentBracketTargetSize(4)).toBe(4);
    expect(tournamentBracketTargetSize(5)).toBe(8);
    expect(tournamentBracketTargetSize(8)).toBe(8);
    expect(tournamentBracketTargetSize(9)).toBe(8);
  });

  test('full bracket requires exact target count', () => {
    expect(isTournamentBracketFull(3)).toBe(false);
    expect(isTournamentBracketFull(4)).toBe(true);
    expect(isTournamentBracketFull(7)).toBe(false);
    expect(isTournamentBracketFull(8)).toBe(true);
  });

  test('ordered entrants respect seed then user id', () => {
    expect(
      orderedUserIdsFromTournamentEntries([
        { userId: 'b', seed: 2 },
        { userId: 'a', seed: 1 },
        { userId: 'c', seed: null },
      ]),
    ).toEqual(['a', 'b', 'c']);
  });

  test('phase status labels', () => {
    expect(tournamentPhaseStatus({ status: 'pending', entrantCount: 2, matchCount: 0 })).toBe(
      'ready_to_start',
    );
    expect(tournamentPhaseStatus({ status: 'pending', entrantCount: 3, matchCount: 0 })).toBe(
      'waiting_for_players',
    );
    expect(tournamentPhaseStatus({ status: 'active', entrantCount: 4, matchCount: 2 })).toBe(
      'underway',
    );
    expect(
      tournamentPhaseStatusLabel(
        tournamentPhaseStatus({ status: 'pending', entrantCount: 4, matchCount: 0 }),
      ),
    ).toBe('Ready to start');
  });
});
