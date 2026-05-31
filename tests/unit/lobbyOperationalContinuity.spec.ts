import { expect, test } from '@playwright/test';

import {
  countOwnOpenLiveSeatsByPlatMode,
  isLiveFreeRecoveryObligation,
  isOwnUnmatchedOpenLiveSeat,
  shouldRenderLobbyExplorationSection,
  shouldRenderLobbyObligationSubsection,
} from '../../lib/lobbyOperationalContinuity';
import { countYourMoveByPlatMode } from '../../lib/lobbyModeFilter';
import {
  firstMoveGraceFinishResult,
  firstMoveGraceRemainingMs,
  shouldShowFirstMoveGraceUi,
} from '../../lib/tournamentFirstMoveGrace';
import { clockUrgencyTier } from '../../lib/tournamentRailPresentation';

test.describe('lobbyOperationalContinuity', () => {
  test('seated live recovery is presence-based: visible to both players regardless of turn', () => {
    const seated = {
      tempo: 'live',
      live_time_control: '5m',
      turn: 'white',
      white_player_id: 'u1',
      black_player_id: 'u2',
    };
    expect(isLiveFreeRecoveryObligation(seated, 'u1')).toBe(true);
    expect(isLiveFreeRecoveryObligation(seated, 'u2')).toBe(true);
    const blackToMove = { ...seated, turn: 'black' };
    expect(isLiveFreeRecoveryObligation(blackToMove, 'u1')).toBe(true);
    expect(isLiveFreeRecoveryObligation(blackToMove, 'u2')).toBe(true);
    expect(isLiveFreeRecoveryObligation(seated, 'u3')).toBe(false);
  });

  test('open waiting seat stays host-only; daily/async excluded', () => {
    const openSeat = {
      tempo: 'live',
      live_time_control: '5m',
      turn: 'white',
      white_player_id: 'u1',
      black_player_id: null,
    };
    expect(isLiveFreeRecoveryObligation(openSeat, 'u1')).toBe(true);
    expect(isLiveFreeRecoveryObligation(openSeat, 'u2')).toBe(false);
    expect(
      isLiveFreeRecoveryObligation(
        { tempo: 'daily', live_time_control: '1d', turn: 'white', white_player_id: 'u1', black_player_id: 'u2' },
        'u1',
      ),
    ).toBe(false);
    expect(
      isLiveFreeRecoveryObligation(
        { tempo: 'correspondence', live_time_control: '3d', turn: 'black', white_player_id: 'u1', black_player_id: 'u2' },
        'u2',
      ),
    ).toBe(false);
  });

  test('own open live seat is not counted as your-move for hub mode badges', () => {
    const uid = 'u1';
    const openSeat = {
      tempo: 'live',
      live_time_control: '10m',
      turn: 'white',
      white_player_id: uid,
      black_player_id: null,
    };
    const seatedYourMove = {
      tempo: 'live',
      live_time_control: '10m',
      turn: 'white',
      white_player_id: uid,
      black_player_id: 'u2',
    };
    expect(isOwnUnmatchedOpenLiveSeat(openSeat, uid)).toBe(true);
    const rows = [openSeat, seatedYourMove];
    expect(countYourMoveByPlatMode(rows, uid).rapid).toBe(1);
    expect(countOwnOpenLiveSeatsByPlatMode(rows, uid).rapid).toBe(1);
    expect(countYourMoveByPlatMode([openSeat], uid).rapid).toBe(0);
    expect(countOwnOpenLiveSeatsByPlatMode([seatedYourMove], uid).rapid).toBe(0);
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
