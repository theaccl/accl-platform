import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { expectFinishedParitySummary } from '../helpers/finishedGameUi';
import {
  createE2eServiceDbContext,
  E2E_RATING_BUCKETS,
  readE2ePairRatingSnapshots,
  resolveE2ePairProfileIds,
  waitForGameRatingAppliedRow,
  type UserRatingBucketsSnapshot,
} from '../helpers/e2ePlayerRatingsRead';
import { setupAcceptedFreeDirectChallenge } from '../helpers/freeRatedChallengePair';

function assertSnapshotsEqual(a: UserRatingBucketsSnapshot, b: UserRatingBucketsSnapshot): void {
  for (const k of E2E_RATING_BUCKETS) {
    expect(a[k]).toEqual(b[k]);
  }
}

const ctxResult = createE2eServiceDbContext();

test.describe('free-play rating mutation (player_ratings)', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.skip(!ctxResult.ok, ctxResult.ok ? '' : ctxResult.reason);

  test.describe.configure({ mode: 'serial', timeout: 200_000 });

  test('unrated free live: no player_ratings mutation; no rating_applied on game', async ({ browser }) => {
    if (!ctxResult.ok) return;
    const { client } = ctxResult;
    const ids = await resolveE2ePairProfileIds(client);
    expect(ids.ok, ids.ok ? '' : ids.reason).toBe(true);
    if (!ids.ok) return;

    const beforePair = await readE2ePairRatingSnapshots(client, ids.userAId, ids.userBId);
    expect(beforePair.ok, beforePair.ok ? '' : beforePair.reason).toBe(true);
    if (!beforePair.ok) return;

    const { pageA, pageB, gameId, dispose } = await setupAcceptedFreeDirectChallenge(browser, {
      rated: false,
      tempo: 'live',
    });
    try {
      await pageB.getByTestId('resign-button').click();
      await expectFinishedParitySummary(pageA, { result: 'white_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      await new Promise((r) => setTimeout(r, 1500));
      const { data: gameRow, error: gErr } = await client
        .from('games')
        .select('rating_applied')
        .eq('id', gameId)
        .single();
      expect(gErr).toBeNull();
      expect(gameRow?.rating_applied).toBeFalsy();

      const afterPair = await readE2ePairRatingSnapshots(client, ids.userAId, ids.userBId);
      expect(afterPair.ok, afterPair.ok ? '' : afterPair.reason).toBe(true);
      if (!afterPair.ok) return;

      assertSnapshotsEqual(beforePair.a, afterPair.a);
      assertSnapshotsEqual(beforePair.b, afterPair.b);
    } finally {
      await dispose();
    }
  });

  test('rated free live: free_live bucket mutates for both users; other buckets unchanged', async ({
    browser,
  }) => {
    if (!ctxResult.ok) return;
    const { client } = ctxResult;
    const ids = await resolveE2ePairProfileIds(client);
    expect(ids.ok, ids.ok ? '' : ids.reason).toBe(true);
    if (!ids.ok) return;

    const beforePair = await readE2ePairRatingSnapshots(client, ids.userAId, ids.userBId);
    expect(beforePair.ok, beforePair.ok ? '' : beforePair.reason).toBe(true);
    if (!beforePair.ok) return;

    const { pageA, pageB, gameId, dispose } = await setupAcceptedFreeDirectChallenge(browser, {
      rated: true,
      tempo: 'live',
    });
    try {
      await pageB.getByTestId('resign-button').click();
      await expectFinishedParitySummary(pageA, { result: 'white_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      const applied = await waitForGameRatingAppliedRow(client, gameId);
      expect(applied.rating_last_update).toBeTruthy();
      const payload = applied.rating_last_update as { bucket?: string; applied?: boolean };
      expect(payload.bucket).toBe('free_live');

      const afterPair = await readE2ePairRatingSnapshots(client, ids.userAId, ids.userBId);
      expect(afterPair.ok, afterPair.ok ? '' : afterPair.reason).toBe(true);
      if (!afterPair.ok) return;

      /* White (A) wins vs resigning Black (B); migration uses ±10 when not draw. */
      expect(afterPair.a.free_live.rating).toBe(beforePair.a.free_live.rating + 10);
      expect(afterPair.a.free_live.games_played).toBe(beforePair.a.free_live.games_played + 1);
      expect(afterPair.b.free_live.rating).toBe(beforePair.b.free_live.rating - 10);
      expect(afterPair.b.free_live.games_played).toBe(beforePair.b.free_live.games_played + 1);

      for (const k of E2E_RATING_BUCKETS) {
        if (k === 'free_live') continue;
        expect(afterPair.a[k]).toEqual(beforePair.a[k]);
        expect(afterPair.b[k]).toEqual(beforePair.b[k]);
      }

    } finally {
      await dispose();
    }
  });
});
