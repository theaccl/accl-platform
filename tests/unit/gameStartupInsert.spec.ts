import { test, expect } from '@playwright/test';

import {
  casualTwoPlayerGameInsert,
  gameInsertFromAcceptedChallenge,
  openSeatNewGameInsert,
  tournamentMatchGameInsert,
} from '../../lib/gameStartupInsert';

test.describe('gameStartupInsert rated propagation', () => {
  test('openSeatNewGameInsert defaults rated false', () => {
    const row = openSeatNewGameInsert('white-id');
    expect(row.rated).toBe(false);
    expect(row.play_context).toBe('free');
  });

  test('openSeatNewGameInsert sets rated true when requested', () => {
    const row = openSeatNewGameInsert('white-id', { rated: true });
    expect(row.rated).toBe(true);
  });

  test('casualTwoPlayerGameInsert passes rated', () => {
    expect(casualTwoPlayerGameInsert('w', 'b', { rated: true }).rated).toBe(true);
    expect(casualTwoPlayerGameInsert('w', 'b').rated).toBe(false);
  });

  test('tournamentMatchGameInsert sets tournament context and source_type', () => {
    const row = tournamentMatchGameInsert({
      whitePlayerId: 'w',
      blackPlayerId: 'b',
      tournamentId: 't-1',
      rated: true,
      tempo: 'live',
    });
    expect(row.play_context).toBe('tournament');
    expect(row.tournament_id).toBe('t-1');
    expect(row.source_type).toBe('tournament_bracket');
    expect(row.mode).toBe('PIT');
    expect(row.rated).toBe(true);
  });

  test('gameInsertFromAcceptedChallenge copies rated from request', () => {
    const base = {
      id: 'req-1',
      request_type: 'challenge',
      white_player_id: 'w',
      black_player_id: 'b',
    };
    expect(gameInsertFromAcceptedChallenge({ ...base, rated: true }).rated).toBe(true);
    expect(gameInsertFromAcceptedChallenge({ ...base, rated: false }).rated).toBe(false);
    expect(gameInsertFromAcceptedChallenge({ ...base }).rated).toBe(false);
  });
});
