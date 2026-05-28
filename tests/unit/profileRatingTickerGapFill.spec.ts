import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ACCL_TIME_CONTROLS, visibleTimeControlsForMode } from '../../lib/acclTimeControls';
import { badgeStateDisplayLabel, boundaryStatusFromBadgeRow } from '../../lib/profileBadgeBoundary';
import { finishedGameHref, finishedGameTrainHref } from '../../lib/profileRatingFinishedLinks';
import { mergeAuthoritativeTrackGameCounts } from '../../lib/profileRatingTrackGameCounts';
import {
  chartPointMarkerForPoint,
  chartPointMarkerLegendKinds,
} from '../../lib/ratingTickerChartMarkers';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

function point(partial: Partial<RatingHistoryPoint>): RatingHistoryPoint {
  return {
    id: 'p1',
    playerId: 'u1',
    ratingTrackId: 'free_blitz_5_5',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingBefore: 1500,
    ratingAfter: 1510,
    ratingDelta: 10,
    occurredAt: '2026-05-01T12:00:00Z',
    ...partial,
  };
}

test.describe('profile rating ticker gap-fill', () => {
  test('chart marker when badge event exists; none when missing', () => {
    expect(chartPointMarkerForPoint(point({ badgeEvent: 'shiny_earned' }))).toBe('shiny_earned');
    expect(chartPointMarkerForPoint(point({ badgeEvent: 'none' }))).toBe('none');
    expect(chartPointMarkerForPoint(point({}))).toBe('none');
  });

  test('tournament settlement marker only for batch/bracket events', () => {
    expect(
      chartPointMarkerForPoint(point({ eventType: 'tournament_batch', result: 'event_settlement' })),
    ).toBe('tournament_settlement');
    expect(chartPointMarkerForPoint(point({ eventType: 'game' }))).toBe('none');
  });

  test('legend lists only kinds present on points', () => {
    const kinds = chartPointMarkerLegendKinds([
      point({ badgeEvent: 'shiny_earned' }),
      point({ id: 'p2', badgeEvent: 'none', streakBefore: 1, streakAfter: 2 }),
    ]);
    expect(kinds).toContain('shiny_earned');
    expect(kinds).toContain('streak');
  });

  test('exact subtrack labels remain correct; no deprecated controls', () => {
    expect(visibleTimeControlsForMode('bullet').map((t) => t.displayValue)).toEqual([
      '1+0',
      '1+1',
      '2',
      '2+1',
    ]);
    expect(visibleTimeControlsForMode('rapid').map((t) => t.displayValue)).toEqual([
      '10',
      '15',
      '30',
      '60',
    ]);
    const labels = ACCL_TIME_CONTROLS.map((t) => t.label);
    expect(labels).not.toContain('2+2');
    expect(labels).not.toContain('10+5');
    expect(labels).not.toContain('15+10');
  });

  test('game counts: mode aggregate separate from exact subtrack', () => {
    const counts = mergeAuthoritativeTrackGameCounts(
      [
        {
          id: 'l-mode',
          player_id: 'u1',
          rating_track_id: 'free_blitz',
          ecosystem: 'free',
          rating_scope: 'mode',
          mode: 'blitz',
          time_control: '5m',
          badge_track_key: null,
          event_type: 'game',
          game_id: 'g-mode',
          tournament_id: null,
          bracket_id: null,
          opponent_id: null,
          opponent_username: null,
          result: 'win',
          rating_before: 1500,
          rating_after: 1510,
          rating_delta: 10,
          occurred_at: '2026-05-01T12:00:00Z',
          badge_state_before: null,
          badge_state_after: null,
          badge_event: null,
          streak_before: null,
          streak_after: null,
          is_backfilled: false,
          metadata: {},
        },
        {
          id: 'l-exact',
          player_id: 'u1',
          rating_track_id: 'free_blitz_5_5',
          ecosystem: 'free',
          rating_scope: 'exact_time_control',
          mode: 'blitz',
          time_control: '5+5',
          badge_track_key: 'blitz_5_5',
          event_type: 'game',
          game_id: 'g-exact',
          tournament_id: null,
          bracket_id: null,
          opponent_id: null,
          opponent_username: null,
          result: 'win',
          rating_before: 1500,
          rating_after: 1510,
          rating_delta: 10,
          occurred_at: '2026-05-02T12:00:00Z',
          badge_state_before: null,
          badge_state_after: null,
          badge_event: null,
          streak_before: null,
          streak_after: null,
          is_backfilled: false,
          metadata: {},
        },
      ],
      [],
      'u1',
      ['free_blitz_5_5'],
    );
    expect(counts.free_blitz).toBe(1);
    expect(counts.free_blitz_5_5).toBe(1);
    expect(counts.free_blitz_3_0).toBe(0);
  });

  test('finished-game links use finished routes when gameId present', () => {
    const chart = src('components/profile/ratings/RatingTickerChart.tsx');
    expect(chart).toContain('rating-point-finished-link');
    expect(chart).toContain('finishedGameHref');
    expect(finishedGameHref('abc')).toBe('/finished/abc');
    expect(finishedGameTrainHref('abc')).toBe('/finished/abc/train');
    expect(chart).not.toContain('/game/${');
  });

  test('badge boundary panel does not fake missing state', () => {
    const panel = src('components/profile/ratings/BadgeBoundaryPanel.tsx');
    expect(panel).toContain('badge-boundary-panel-empty');
    expect(panel).toContain('RATING_BADGE_UNAVAILABLE');
    expect(badgeStateDisplayLabel(null)).toBe('—');
    expect(boundaryStatusFromBadgeRow({ visual_state: 'upgraded', pressure_state: 'stable' })).toBe(
      'on_the_rise',
    );
  });

  test('daily precedence migration blocks correspondence for free/daily/1d', () => {
    const sql = readFileSync(
      join(root, 'supabase/migrations/20260619171000_fix_daily_rating_bucket_precedence.sql'),
      'utf8',
    );
    const dailyIdx = sql.indexOf("if t = 'daily'");
    const corrIdx = sql.indexOf("if lc in ('1d', '2d', '3d')");
    expect(dailyIdx).toBeGreaterThan(-1);
    expect(corrIdx).toBeGreaterThan(dailyIdx);
    expect(sql).toContain('-- free_daily');
  });

  test('Nexus and Vault do not own profile rating dashboard', () => {
    expect(src('app/nexus/page.tsx')).not.toContain('profile-rating-dashboard');
    expect(src('app/vault/page.tsx')).not.toContain('profile-rating-dashboard');
  });

  test('RatingTickerChart keeps empty state test id', () => {
    expect(src('components/profile/ratings/RatingTickerChart.tsx')).toContain(
      'rating-ticker-chart-empty',
    );
  });

  test('mobile expanded drawer is profile-scoped', () => {
    const drawer = src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    expect(drawer).toContain('expanded-rating-ticker-drawer');
    expect(drawer).toContain('sm:hidden');
  });
});
