import { expect, test } from '@playwright/test';

import {
  isLiveFreeRecoveryObligation,
  shouldRenderLobbyExplorationSection,
  shouldRenderLobbyObligationSubsection,
} from '../../lib/lobbyOperationalContinuity';
import {
  firstMoveGraceFinishResult,
  firstMoveGraceRemainingMs,
  shouldShowFirstMoveGraceUi,
} from '../../lib/tournamentFirstMoveGrace';
import { clockUrgencyTier } from '../../lib/tournamentRailPresentation';

test.describe('lobbyOperationalContinuity', () => {
  test('live recovery shows your-turn seated and your open seats only', () => {
    const uid = 'u1';
    expect(
      isLiveFreeRecoveryObligation(
        {
          tempo: 'live',
          live_time_control: '5m',
          turn: 'white',
          white_player_id: uid,
          black_player_id: 'u2',
        },
        uid,
      ),
    ).toBe(true);
    expect(
      isLiveFreeRecoveryObligation(
        {
          tempo: 'live',
          live_time_control: '5m',
          turn: 'white',
          white_player_id: uid,
          black_player_id: 'u2',
        },
        'u2',
      ),
    ).toBe(false);
    expect(
      isLiveFreeRecoveryObligation(
        {
          tempo: 'live',
          live_time_control: '5m',
          turn: 'white',
          white_player_id: uid,
          black_player_id: null,
        },
        uid,
      ),
    ).toBe(true);
  });

  test('filtered mode hides empty obligation subsections', () => {
    expect(shouldRenderLobbyObligationSubsection(null, 0, false)).toBe(true);
    expect(shouldRenderLobbyObligationSubsection('bullet', 0, false)).toBe(false);
    expect(shouldRenderLobbyObligationSubsection('bullet', 2, false)).toBe(true);
    expect(shouldRenderLobbyExplorationSection('rapid', false, false)).toBe(false);
  });
});

test.describe('tournamentFirstMoveGrace', () => {
  test('grace UI only before first move on live tournament boards', () => {
    expect(
      shouldShowFirstMoveGraceUi({
        game: {
          play_context: 'tournament',
          tournament_id: 't1',
          tempo: 'live',
          status: 'active',
          white_player_id: 'a',
          black_player_id: 'b',
        },
        moveCount: 0,
        gameStatus: 'active',
      }),
    ).toBe(true);
    expect(
      shouldShowFirstMoveGraceUi({
        game: {
          play_context: 'free',
          tournament_id: null,
          tempo: 'live',
          status: 'active',
          white_player_id: 'a',
          black_player_id: 'b',
        },
        moveCount: 0,
        gameStatus: 'active',
      }),
    ).toBe(false);
  });

  test('white absentee yields black_win', () => {
    expect(firstMoveGraceFinishResult('white')).toBe('black_win');
  });

  test('remaining ms decreases toward deadline', () => {
    const anchor = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const left = firstMoveGraceRemainingMs({ created_at: anchor }, Date.parse(anchor) + 5_000);
    expect(left).toBeGreaterThan(0);
  });
});

test.describe('tournamentRailPresentation', () => {
  test('clock urgency tiers by budget thirds', () => {
    expect(clockUrgencyTier(10_000, 60_000)).toBe('red');
    expect(clockUrgencyTier(40_000, 60_000)).toBe('yellow');
    expect(clockUrgencyTier(50_000, 60_000)).toBe('green');
  });
});
