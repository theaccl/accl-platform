import { test, expect } from '@playwright/test';

import {
  buildViewerObligationCopy,
  findViewerPlayableMatch,
  isFreePlayDiscoveryPath,
  isTournamentFieldReady,
  isTournamentSessionLive,
  listOtherLiveTournamentBoards,
  listSameRoundTournamentBoards,
  resolveTournamentSessionRedirectTarget,
  TOURNAMENT_FIELD_READY_MESSAGE,
} from '@/lib/tournamentSessionContinuity';

test.describe('tournament session continuity (unit)', () => {
  test('discovery paths include lobby and play surfaces', () => {
    expect(isFreePlayDiscoveryPath('/free/lobby')).toBe(true);
    expect(isFreePlayDiscoveryPath('/free/lobby/blitz')).toBe(true);
    expect(isFreePlayDiscoveryPath('/free/play')).toBe(true);
    expect(isFreePlayDiscoveryPath('/free/active')).toBe(true);
    expect(isFreePlayDiscoveryPath('/game/abc')).toBe(false);
    expect(isFreePlayDiscoveryPath('/tournaments/abc')).toBe(false);
  });

  test('active session is only live tournament status', () => {
    expect(isTournamentSessionLive('active')).toBe(true);
    expect(isTournamentSessionLive('pending')).toBe(false);
    expect(isTournamentSessionLive('completed')).toBe(false);
  });

  test('redirect prefers spawned board over shell', () => {
    const target = resolveTournamentSessionRedirectTarget({
      pathname: '/free/lobby',
      activeGames: [{ tournamentId: 't1', gameId: 'g1' }],
      activeParticipations: [{ tournamentId: 't1' }],
    });
    expect(target?.href).toBe('/game/g1');
    expect(target?.kind).toBe('game');
  });

  test('redirect to shell when participant has no active board', () => {
    const target = resolveTournamentSessionRedirectTarget({
      pathname: '/free/play',
      activeGames: [],
      activeParticipations: [{ tournamentId: 't1' }],
    });
    expect(target?.href).toBe('/tournaments/t1');
    expect(target?.kind).toBe('tournament');
  });

  test('no redirect when already on tournament hub without spawned board', () => {
    const target = resolveTournamentSessionRedirectTarget({
      pathname: '/tournaments/t1',
      activeGames: [],
      activeParticipations: [{ tournamentId: 't1' }],
    });
    expect(target).toBeNull();
  });

  test('redirect from tournament hub when board spawns', () => {
    const target = resolveTournamentSessionRedirectTarget({
      pathname: '/tournaments/t1',
      activeGames: [{ tournamentId: 't1', gameId: 'g1' }],
      activeParticipations: [{ tournamentId: 't1' }],
    });
    expect(target?.href).toBe('/game/g1');
  });

  test('redirect from unrelated game when obligation board exists', () => {
    const target = resolveTournamentSessionRedirectTarget({
      pathname: '/game/free-other',
      activeGames: [{ tournamentId: 't1', gameId: 'g1' }],
      activeParticipations: [{ tournamentId: 't1' }],
    });
    expect(target?.href).toBe('/game/g1');
  });

  test('field ready when pending and bracket full', () => {
    expect(isTournamentFieldReady('pending', 4)).toBe(true);
    expect(isTournamentFieldReady('pending', 3)).toBe(false);
    expect(isTournamentFieldReady('active', 4)).toBe(false);
    expect(TOURNAMENT_FIELD_READY_MESSAGE).toContain('Do not start a new game');
  });

  test('findViewerPlayableMatch returns earliest live board', () => {
    const m = findViewerPlayableMatch(
      'u1',
      [
        {
          round_number: 2,
          match_number: 1,
          player1_id: 'u1',
          player2_id: 'u2',
          game_id: 'g2',
          winner_id: null,
        },
        {
          round_number: 1,
          match_number: 1,
          player1_id: 'u1',
          player2_id: 'u2',
          game_id: 'g1',
          winner_id: null,
        },
      ],
      { g1: 'active', g2: 'active' },
    );
    expect(m?.game_id).toBe('g1');
  });

  test('obligation copy for ready board', () => {
    const copy = buildViewerObligationCopy({
      userId: 'u1',
      tournamentStatus: 'active',
      eliminated: false,
      matches: [
        {
          round_number: 1,
          match_number: 1,
          player1_id: 'u1',
          player2_id: 'u2',
          game_id: 'g1',
          winner_id: null,
        },
      ],
      gameStatusById: { g1: 'active' },
    });
    expect(copy.headline).toBe('Your match is ready');
    expect(copy.gameId).toBe('g1');
  });

  test('lists same-round boards for rail', () => {
    const rows = listSameRoundTournamentBoards(
      1,
      [
        {
          round_number: 1,
          match_number: 1,
          player1_id: 'u1',
          player2_id: 'u2',
          game_id: 'g1',
          winner_id: null,
        },
        {
          round_number: 1,
          match_number: 2,
          player1_id: 'u3',
          player2_id: 'u4',
          game_id: 'g2',
          winner_id: null,
        },
      ],
      { g1: 'active', g2: 'active' },
      'g1',
      'u1',
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.gameId === 'g1')?.isCurrentBoard).toBe(true);
  });

  test('lists other live boards excluding viewer seats', () => {
    const rows = listOtherLiveTournamentBoards(
      'u1',
      [
        {
          round_number: 1,
          match_number: 1,
          player1_id: 'u1',
          player2_id: 'u2',
          game_id: 'g1',
          winner_id: null,
        },
        {
          round_number: 1,
          match_number: 2,
          player1_id: 'u3',
          player2_id: 'u4',
          game_id: 'g2',
          winner_id: null,
        },
      ],
      { g1: 'active', g2: 'active' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.gameId).toBe('g2');
  });
});
