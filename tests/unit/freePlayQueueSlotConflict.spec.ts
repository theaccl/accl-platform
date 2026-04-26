import { expect, test } from '@playwright/test';

import { freePlayTargetSlot, freePlayUserBlockedForTargetSlot } from '../../lib/freePlayQueueSlotConflict';

test.describe('freePlayQueueSlotConflict', () => {
  test('same live mode+clock+rated blocks, different mode does not', () => {
    const uid = 'u1';
    const blitz3 = freePlayUserBlockedForTargetSlot(
      uid,
      {
        id: 'g1',
        white_player_id: uid,
        black_player_id: null,
        tempo: 'live',
        live_time_control: '3m',
        rated: true,
        status: 'active',
      },
      freePlayTargetSlot('blitz', '3m', true)
    );
    expect(blitz3).toBe(true);

    const blitz3UnratedTarget = freePlayUserBlockedForTargetSlot(
      uid,
      {
        id: 'g1',
        white_player_id: uid,
        black_player_id: null,
        tempo: 'live',
        live_time_control: '3m',
        rated: true,
        status: 'active',
      },
      freePlayTargetSlot('blitz', '3m', false)
    );
    expect(blitz3UnratedTarget).toBe(false);

    const rapidWhileBlitz = freePlayUserBlockedForTargetSlot(
      uid,
      {
        id: 'g1',
        white_player_id: uid,
        black_player_id: null,
        tempo: 'live',
        live_time_control: '3m',
        rated: true,
        status: 'active',
      },
      freePlayTargetSlot('rapid', '10m', true)
    );
    expect(rapidWhileBlitz).toBe(false);
  });
});
