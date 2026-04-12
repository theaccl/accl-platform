import { test, expect } from '@playwright/test';

import {
  bothPlayersSeated,
  isBoardReadyGame,
  isLobbyNonFinishedGame,
  isWaitingForOpponentSeat,
  partitionNonFinishedLobbyGames,
  pickExistingActiveGameForRedirect,
  sortLobbyGamesForDisplay,
} from '../../lib/freePlayLobby';

test.describe('freePlayLobby helpers', () => {
  test('isBoardReadyGame requires both players and active/waiting status', () => {
    expect(
      isBoardReadyGame({
        status: 'active',
        white_player_id: 'a',
        black_player_id: 'b',
      })
    ).toBe(true);
    expect(
      isBoardReadyGame({
        status: 'waiting',
        white_player_id: 'a',
        black_player_id: 'b',
      })
    ).toBe(true);
    expect(
      isBoardReadyGame({
        status: 'active',
        white_player_id: 'a',
        black_player_id: null,
      })
    ).toBe(false);
    expect(
      isBoardReadyGame({
        status: 'finished',
        white_player_id: 'a',
        black_player_id: 'b',
      })
    ).toBe(false);
  });

  test('isWaitingForOpponentSeat is true for open-seat style rows', () => {
    expect(
      isWaitingForOpponentSeat({
        status: 'active',
        white_player_id: 'a',
        black_player_id: null,
      })
    ).toBe(true);
    expect(
      isWaitingForOpponentSeat({
        status: 'active',
        white_player_id: 'a',
        black_player_id: 'b',
      })
    ).toBe(false);
  });

  test('sortLobbyGamesForDisplay puts seated games before waiting seats', () => {
    const waiting = {
      id: 'w',
      status: 'active',
      white_player_id: 'a',
      black_player_id: null,
    } as const;
    const seated = {
      id: 's',
      status: 'active',
      white_player_id: 'a',
      black_player_id: 'b',
    } as const;
    const ordered = sortLobbyGamesForDisplay([waiting, seated]);
    expect(ordered.map((g) => g.id)).toEqual(['s', 'w']);
  });

  test('pickExistingActiveGameForRedirect prefers board-ready over newer open seat', () => {
    const openNew = {
      id: 'o1',
      status: 'active',
      white_player_id: 'a',
      black_player_id: null,
    };
    const seatedOld = {
      id: 's1',
      status: 'active',
      white_player_id: 'a',
      black_player_id: 'b',
    };
    expect(pickExistingActiveGameForRedirect([openNew, seatedOld])).toEqual(seatedOld);
    expect(pickExistingActiveGameForRedirect([openNew])).toEqual(openNew);
  });

  test('partitionNonFinishedLobbyGames: newest seated canonical; older seated stale', () => {
    const newer = { id: 'n', status: 'active', white_player_id: 'w', black_player_id: 'b' };
    const older = { id: 'o', status: 'active', white_player_id: 'w', black_player_id: 'x' };
    const p = partitionNonFinishedLobbyGames([newer, older]);
    expect(p.canonicalSeated).toEqual(newer);
    expect(p.staleSeated).toEqual([older]);
    expect(p.primaryWaiting).toBeNull();
  });

  test('partitionNonFinishedLobbyGames: canonical seated plus newest open seat both identified', () => {
    const seated = { id: 's', status: 'active', white_player_id: 'w', black_player_id: 'b' };
    const open1 = { id: 'o1', status: 'active', white_player_id: 'w', black_player_id: null };
    const p = partitionNonFinishedLobbyGames([seated, open1]);
    expect(p.canonicalSeated).toEqual(seated);
    expect(p.primaryWaiting).toEqual(open1);
    expect(p.staleWaiting).toHaveLength(0);
  });

  test('bothPlayersSeated and isLobbyNonFinishedGame', () => {
    expect(
      bothPlayersSeated({
        status: 'active',
        white_player_id: 'a',
        black_player_id: null,
      })
    ).toBe(false);
    expect(isLobbyNonFinishedGame({ status: 'active', white_player_id: 'a', black_player_id: null })).toBe(
      true
    );
    expect(isLobbyNonFinishedGame({ status: 'finished', white_player_id: 'a', black_player_id: 'b' })).toBe(
      false
    );
  });
});
