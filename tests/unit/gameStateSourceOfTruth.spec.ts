import { expect, test } from '@playwright/test';

import {
  buildAuthoritativeMovePatch,
  isAuthoritativelyFinished,
  trainerEligibleFromStatus,
} from '../../lib/gameStateSourceOfTruth';

test.describe('gameStateSourceOfTruth', () => {
  test('waiting game promotes to active on first authoritative move patch', () => {
    const patch = buildAuthoritativeMovePatch({
      nextFen: 'fen-after',
      nextTurn: 'black',
      statusBefore: 'waiting',
      tempo: 'live',
      liveTimeControl: '5m',
      currentTurn: 'white',
      whiteClockMs: 300000,
      blackClockMs: 300000,
      lastMoveAt: null,
      movedAt: new Date('2026-04-09T00:00:00.000Z'),
    });

    expect(patch.status).toBe('active');
    expect(patch.fen).toBe('fen-after');
    expect(patch.turn).toBe('black');
    expect(typeof patch.last_move_at).toBe('string');
  });

  test('finished status is the only trainer-eligible truth state', () => {
    expect(isAuthoritativelyFinished('finished')).toBe(true);
    expect(trainerEligibleFromStatus('finished')).toBe(true);
    expect(trainerEligibleFromStatus('active')).toBe(false);
    expect(trainerEligibleFromStatus('waiting')).toBe(false);
  });
});
