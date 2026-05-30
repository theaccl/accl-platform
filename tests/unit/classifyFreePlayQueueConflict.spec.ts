import { expect, test } from '@playwright/test';
import { classifyFreePlayQueueConflict } from '../../lib/classifyFreePlayQueueConflict';

const ME = 'user-1';
const OTHER = 'user-2';

test.describe('classifyFreePlayQueueConflict', () => {
  test('own unmatched live open seat → waiting_seat', () => {
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: ME, black_player_id: null, status: 'active', tempo: 'live' },
        ME
      )
    ).toBe('waiting_seat');
    // waiting status is also a valid open seat
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: ME, black_player_id: null, status: 'waiting', tempo: 'live' },
        ME
      )
    ).toBe('waiting_seat');
  });

  test('seated two-player live game → seated_live_game (as white or black)', () => {
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: ME, black_player_id: OTHER, status: 'active', tempo: 'live' },
        ME
      )
    ).toBe('seated_live_game');
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: OTHER, black_player_id: ME, status: 'active', tempo: 'live' },
        ME
      )
    ).toBe('seated_live_game');
  });

  test('finished rows are not classified (do not drive waiting-seat UX)', () => {
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: ME, black_player_id: null, status: 'finished', tempo: 'live' },
        ME
      )
    ).toBeNull();
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: ME, black_player_id: OTHER, status: 'finished', tempo: 'live' },
        ME
      )
    ).toBeNull();
  });

  test("another player's open seat is not the current user's waiting seat", () => {
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: OTHER, black_player_id: null, status: 'active', tempo: 'live' },
        ME
      )
    ).toBeNull();
  });

  test('daily / correspondence tempo is excluded', () => {
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: ME, black_player_id: null, status: 'active', tempo: 'daily' },
        ME
      )
    ).toBeNull();
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: ME, black_player_id: OTHER, status: 'active', tempo: 'correspondence' },
        ME
      )
    ).toBeNull();
  });

  test('seated bot game (live) classifies as seated_live_game', () => {
    // A bot game has both seats filled and tempo live; from the queue guard's
    // perspective it is a seated live game (not an open waiting seat).
    expect(
      classifyFreePlayQueueConflict(
        { white_player_id: ME, black_player_id: 'bot-1', status: 'active', tempo: 'live' },
        ME
      )
    ).toBe('seated_live_game');
  });
});
