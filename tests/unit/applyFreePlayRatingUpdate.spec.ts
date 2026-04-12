import { test, expect } from '@playwright/test';

import { applyFreePlayRatingUpdate } from '../../lib/applyFreePlayRatingUpdate';

type MinimalClient = {
  rpc: (name: string, args: { p_game_id: string }) => Promise<{ data: unknown; error: null }>;
};

test.describe('applyFreePlayRatingUpdate', () => {
  test('skips active game without calling rpc', async () => {
    let rpcCalled = false;
    const client = {
      rpc: async () => {
        rpcCalled = true;
        return { data: {}, error: null };
      },
    } as MinimalClient;
    const r = await applyFreePlayRatingUpdate(client as never, {
      id: 'g1',
      status: 'active',
      white_player_id: 'w',
      black_player_id: 'b',
      rated: true,
      play_context: 'free',
      tempo: 'live',
    });
    expect(rpcCalled).toBe(false);
    expect(r.skipped).toBe(true);
  });

  test('skips tournament context without rpc', async () => {
    let rpcCalled = false;
    const client = {
      rpc: async () => {
        rpcCalled = true;
        return { data: {}, error: null };
      },
    } as MinimalClient;
    const r = await applyFreePlayRatingUpdate(client as never, {
      id: 'g1',
      status: 'finished',
      white_player_id: 'w',
      black_player_id: 'b',
      rated: true,
      play_context: 'tournament',
      tempo: 'live',
    });
    expect(rpcCalled).toBe(false);
    expect(r.skipped).toBe(true);
    if (r.skipped) expect(r.reason).toBe('not_immediate_eligible');
  });

  test('calls rpc for finished rated free live when eligible', async () => {
    let rpcCalled = false;
    const client = {
      rpc: async (name: string, args: { p_game_id: string }) => {
        rpcCalled = true;
        expect(name).toBe('apply_free_play_rating_update');
        expect(args.p_game_id).toBe('g1');
        return {
          data: { applied: true, bucket: 'free_live', white: { before: 1500, after: 1510 } },
          error: null,
        };
      },
    } as MinimalClient;
    const r = await applyFreePlayRatingUpdate(client as never, {
      id: 'g1',
      status: 'finished',
      white_player_id: 'w',
      black_player_id: 'b',
      rated: true,
      play_context: 'free',
      tempo: 'live',
    });
    expect(rpcCalled).toBe(true);
    expect(r.skipped).toBe(false);
    if (!r.skipped) {
      expect(r.payload.applied).toBe(true);
      expect(r.payload.bucket).toBe('free_live');
    }
  });
});
