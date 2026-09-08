import type { SupabaseClient } from '@supabase/supabase-js';

import { timeControlByRatingTrackId } from '@/lib/acclTimeControls';
import type { CompareHistoryCoverage, ComparePeriod } from '@/lib/profile/compareMode';
import {
  buildRatingHistoryPointsFromLedger,
  type RatingHistoryLedgerRow,
} from '@/lib/ratingHistoryLedgerBuild';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

const LEDGER_COLUMNS =
  'id,player_id,rating_track_id,ecosystem,rating_scope,mode,time_control,badge_track_key,event_type,game_id,tournament_id,bracket_id,opponent_id,opponent_username,result,rating_before,rating_after,rating_delta,occurred_at,badge_state_before,badge_state_after,badge_event,streak_before,streak_after,is_backfilled,metadata';
const PAGE_SIZE = 500;

export type CompareTickerPeriodLoad = {
  status: 'complete' | 'incomplete' | 'unauthorized';
  points: RatingHistoryPoint[];
  coverage: CompareHistoryCoverage;
  message?: string;
};

export type CompareTickerPeriodLoadContext = {
  dashboardSource?: 'ledger' | 'games' | 'none';
  dashboardPoints?: RatingHistoryPoint[];
};

function emptyCoverage(period: ComparePeriod): CompareHistoryCoverage {
  return { startMs: period.startMs, endMs: period.startMs, priorToStartResolved: false };
}

type TrackFilterBuilder<T> = {
  in(column: string, values: string[]): T;
  eq(column: string, value: string): T;
  neq(column: string, value: string): T;
};

function applyTrackFilters<T extends TrackFilterBuilder<T>>(query: T, ratingTrackId: string): T {
  const def = timeControlByRatingTrackId(ratingTrackId);
  let filtered =
    ratingTrackId === 'accl'
      ? query.in('rating_track_id', ['accl', 'accl_overall'])
      : query.eq('rating_track_id', ratingTrackId);
  if (def?.badgeTrackKey) {
    filtered = filtered
      .eq('rating_scope', 'exact_time_control')
      .eq('badge_track_key', def.badgeTrackKey);
  } else {
    filtered = filtered.neq('rating_scope', 'exact_time_control');
  }
  return filtered;
}

function periodQuery(
  supabase: SupabaseClient,
  playerId: string,
  ratingTrackId: string,
  period: ComparePeriod,
  from: number,
  to: number,
) {
  const base = supabase
    .from('player_rating_history_ledger')
    .select(LEDGER_COLUMNS, { count: 'exact' })
    .eq('player_id', playerId)
    .gte('occurred_at', new Date(period.startMs).toISOString())
    .lt('occurred_at', new Date(period.endMs).toISOString());
  return applyTrackFilters(base, ratingTrackId)
    .order('occurred_at', { ascending: true })
    .range(from, to);
}

function priorQuery(
  supabase: SupabaseClient,
  playerId: string,
  ratingTrackId: string,
  period: ComparePeriod,
) {
  const base = supabase
    .from('player_rating_history_ledger')
    .select(LEDGER_COLUMNS)
    .eq('player_id', playerId)
    .lt('occurred_at', new Date(period.startMs).toISOString());
  return applyTrackFilters(base, ratingTrackId)
    .order('occurred_at', { ascending: false })
    .limit(1);
}

/**
 * Read one exact self-only CT period plus the authoritative event immediately
 * before it. Pagination and an exact row count make an empty/hold claim
 * explicit rather than inferring it from the dashboard's bounded history.
 */
export async function loadCompareTickerPeriod(
  supabase: SupabaseClient,
  playerId: string,
  isSelf: boolean,
  ratingTrackId: string,
  period: ComparePeriod,
  context: CompareTickerPeriodLoadContext = {},
): Promise<CompareTickerPeriodLoad> {
  if (!isSelf) {
    return {
      status: 'unauthorized',
      points: [],
      coverage: emptyCoverage(period),
      message: 'Comparison history is available only on your own profile.',
    };
  }

  if (context.dashboardSource === 'games') {
    return {
      status: 'incomplete',
      points: context.dashboardPoints ?? [],
      coverage: emptyCoverage(period),
      message: 'This track uses bounded legacy game history, so complete period totals are withheld.',
    };
  }

  const rows: RatingHistoryLedgerRow[] = [];
  let expectedCount: number | null = null;
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await periodQuery(
      supabase,
      playerId,
      ratingTrackId,
      period,
      from,
      from + PAGE_SIZE - 1,
    );
    if (result.error) {
      return {
        status: 'incomplete',
        points: buildRatingHistoryPointsFromLedger(rows, playerId, ratingTrackId),
        coverage: emptyCoverage(period),
        message: 'This historical period could not be fully verified.',
      };
    }
    expectedCount ??= result.count ?? null;
    const page = (result.data ?? []) as RatingHistoryLedgerRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const prior = await priorQuery(supabase, playerId, ratingTrackId, period);
  if (prior.error || expectedCount == null || rows.length !== expectedCount) {
    return {
      status: 'incomplete',
      points: buildRatingHistoryPointsFromLedger(rows, playerId, ratingTrackId),
      coverage: emptyCoverage(period),
      message: 'This historical period could not be fully verified.',
    };
  }

  const allRows = [...((prior.data ?? []) as RatingHistoryLedgerRow[]), ...rows];
  return {
    status: 'complete',
    points: buildRatingHistoryPointsFromLedger(allRows, playerId, ratingTrackId),
    coverage: {
      startMs: period.startMs,
      endMs: period.endMs,
      priorToStartResolved: true,
    },
  };
}
