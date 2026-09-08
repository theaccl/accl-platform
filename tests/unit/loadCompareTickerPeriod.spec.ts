import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { compareAnchorPeriod } from '@/lib/profile/compareMode';
import { loadCompareTickerPeriod } from '@/lib/profile/loadCompareTickerPeriod';
import type { RatingHistoryLedgerRow } from '@/lib/ratingHistoryLedgerBuild';

function row(id: string, occurredAt: string, ratingBefore: number, ratingAfter: number): RatingHistoryLedgerRow {
  return {
    id,
    player_id: 'u1',
    rating_track_id: 'free_day',
    ecosystem: 'free',
    rating_scope: 'mode',
    mode: 'daily',
    time_control: '1 day',
    badge_track_key: null,
    event_type: 'game',
    game_id: `g-${id}`,
    tournament_id: null,
    bracket_id: null,
    opponent_id: 'u2',
    opponent_username: 'Opponent',
    result: 'win',
    rating_before: ratingBefore,
    rating_after: ratingAfter,
    rating_delta: ratingAfter - ratingBefore,
    occurred_at: occurredAt,
    badge_state_before: null,
    badge_state_after: null,
    badge_event: null,
    streak_before: null,
    streak_after: null,
    is_backfilled: false,
    metadata: null,
  };
}

function mockClient(periodRows: RatingHistoryLedgerRow[], priorRows: RatingHistoryLedgerRow[] = []) {
  let fromCalls = 0;
  const ranges: Array<[number, number]> = [];
  const client = {
    from() {
      fromCalls += 1;
      const builder: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'gte', 'lt', 'neq', 'in', 'order']) {
        builder[name] = () => builder;
      }
      builder.range = (from: number, to: number) => {
        ranges.push([from, to]);
        return Promise.resolve({
          data: periodRows.slice(from, to + 1),
          count: periodRows.length,
          error: null,
        });
      };
      builder.limit = () => Promise.resolve({ data: priorRows.slice(0, 1), error: null });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, ranges, getFromCalls: () => fromCalls };
}

test('fails closed without querying for a non-self viewer', async () => {
  const period = compareAnchorPeriod('month', Date.parse('2026-08-15T00:00:00Z'))!;
  const mock = mockClient([]);
  const result = await loadCompareTickerPeriod(mock.client, 'u1', false, 'free_day', period);
  expect(result.status).toBe('unauthorized');
  expect(mock.getFromCalls()).toBe(0);
  expect(result.coverage.priorToStartResolved).toBe(false);
});

test('does not mislabel bounded legacy game fallback as complete ledger coverage', async () => {
  const period = compareAnchorPeriod('month', Date.parse('2026-08-15T00:00:00Z'))!;
  const mock = mockClient([]);
  const legacyPoint = {
    id: 'legacy',
    playerId: 'u1',
    ratingTrackId: 'free_day',
    ecosystem: 'free' as const,
    eventType: 'game' as const,
    result: 'win' as const,
    ratingBefore: 1500,
    ratingAfter: 1508,
    ratingDelta: 8,
    occurredAt: '2026-08-10T12:00:00Z',
  };
  const result = await loadCompareTickerPeriod(
    mock.client,
    'u1',
    true,
    'free_day',
    period,
    { dashboardSource: 'games', dashboardPoints: [legacyPoint] },
  );
  expect(result.status).toBe('incomplete');
  expect(result.points).toEqual([legacyPoint]);
  expect(result.coverage.priorToStartResolved).toBe(false);
  expect(mock.getFromCalls()).toBe(0);
});

test('loads the exact period and prior baseline with explicit complete coverage', async () => {
  const period = compareAnchorPeriod('month', Date.parse('2026-08-15T00:00:00Z'))!;
  const mock = mockClient(
    [row('inside', '2026-08-10T12:00:00Z', 1500, 1510)],
    [row('prior', '2026-07-31T12:00:00Z', 1490, 1500)],
  );
  const result = await loadCompareTickerPeriod(mock.client, 'u1', true, 'free_day', period);
  expect(result.status).toBe('complete');
  expect(result.points.map((point) => point.id)).toEqual(['prior', 'inside']);
  expect(result.coverage).toEqual({
    startMs: period.startMs,
    endMs: period.endMs,
    priorToStartResolved: true,
  });
  expect(mock.ranges).toEqual([[0, 499]]);
});

test('paginates beyond the dashboard limits before claiming complete coverage', async () => {
  const period = compareAnchorPeriod('year', Date.parse('2026-06-15T00:00:00Z'))!;
  const rows = Array.from({ length: 501 }, (_, index) =>
    row(
      `inside-${String(index).padStart(3, '0')}`,
      `2026-06-15T${String(Math.floor(index / 60) % 24).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00Z`,
      1500 + index,
      1501 + index,
    ),
  );
  const mock = mockClient(rows);
  const result = await loadCompareTickerPeriod(mock.client, 'u1', true, 'free_day', period);
  expect(result.status).toBe('complete');
  expect(result.points).toHaveLength(501);
  expect(mock.ranges).toEqual([[0, 499], [500, 999]]);
});
