import { expect, test } from '@playwright/test';

import {
  freePlayTargetSlot,
  freePlayUserBlockedForTargetSlot,
  freePlayUserSeatedInAnyActiveLiveGame,
  freePlayUserSeatedInConflictingSlot,
} from '../../lib/freePlayQueueSlotConflict';

const seatedRapid10 = {
  id: 'live10',
  white_player_id: 'u1',
  black_player_id: 'u2',
  tempo: 'live',
  live_time_control: '10m',
  rated: true,
  status: 'active',
} as const;

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

  test('seated daily/correspondence does not block a live target slot', () => {
    const uid = 'u1';
    const target10m = freePlayTargetSlot('rapid', '10m', true);

    expect(
      freePlayUserBlockedForTargetSlot(
        uid,
        {
          id: 'g-daily',
          white_player_id: uid,
          black_player_id: 'u2',
          tempo: 'daily',
          live_time_control: '1d',
          rated: true,
          status: 'active',
        },
        target10m
      )
    ).toBe(false);

    expect(
      freePlayUserSeatedInConflictingSlot(
        uid,
        {
          id: 'g-daily',
          white_player_id: uid,
          black_player_id: 'u2',
          tempo: 'daily',
          live_time_control: '1d',
          rated: true,
          status: 'active',
        },
        target10m
      )
    ).toBe(false);

    expect(
      freePlayUserSeatedInConflictingSlot(
        uid,
        {
          id: 'g-corr',
          white_player_id: 'u2',
          black_player_id: uid,
          tempo: 'correspondence',
          live_time_control: '3+2',
          rated: true,
          status: 'active',
        },
        target10m
      )
      ).toBe(false);
  });
});

test.describe('freePlayUserSeatedInAnyActiveLiveGame (P0 cross-slot)', () => {
  test('matches a seated two-player active live game the user is in', () => {
    expect(freePlayUserSeatedInAnyActiveLiveGame([seatedRapid10], 'u1')?.id).toBe('live10');
    expect(freePlayUserSeatedInAnyActiveLiveGame([{ ...seatedRapid10, white_player_id: 'x', black_player_id: 'u1' }], 'u1')?.id).toBe('live10');
  });

  test('does NOT match an unmatched waiting seat (host alone)', () => {
    expect(
      freePlayUserSeatedInAnyActiveLiveGame(
        [{ ...seatedRapid10, black_player_id: null }],
        'u1'
      )
    ).toBeNull();
  });

  test('does NOT match daily / correspondence / async rows', () => {
    expect(
      freePlayUserSeatedInAnyActiveLiveGame([{ ...seatedRapid10, tempo: 'daily', live_time_control: '1d' }], 'u1')
    ).toBeNull();
    expect(
      freePlayUserSeatedInAnyActiveLiveGame([{ ...seatedRapid10, tempo: 'correspondence', live_time_control: '3d' }], 'u1')
    ).toBeNull();
  });

  test('does NOT match finished rows or unrelated players', () => {
    expect(freePlayUserSeatedInAnyActiveLiveGame([{ ...seatedRapid10, status: 'finished' }], 'u1')).toBeNull();
    expect(freePlayUserSeatedInAnyActiveLiveGame([seatedRapid10], 'u3')).toBeNull();
    expect(freePlayUserSeatedInAnyActiveLiveGame([], 'u1')).toBeNull();
  });
});
