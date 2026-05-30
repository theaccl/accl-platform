'use client';

import { useMemo, useState } from 'react';
import type { PlayerBadgeStateRow } from '@/lib/badgeSettlement';
import { timeControlByRatingTrackId } from '@/lib/acclTimeControls';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import {
  DEFAULT_RATING_LANE,
  RATING_LANES,
  RATING_LANE_LABELS,
  RATING_RESULT_FILTERS,
  RATING_RESULT_FILTER_LABELS,
  filterPointsByLane,
  filterPointsByResult,
  summarizeLaneMetrics,
  type RatingLane,
  type RatingResultFilter,
} from '@/lib/ratingHistoryMetrics';
import { BadgeBoundaryPanel } from '@/components/profile/ratings/BadgeBoundaryPanel';
import { ExpandedRatingTickerDrawer } from '@/components/profile/ratings/ExpandedRatingTickerDrawer';
import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';
import {
  exactTrackHistoryEmptyLabel,
  RATING_EXACT_SELF_ONLY,
  RATING_LANE_EMPTY,
  resultFilterEmptyLabel,
} from '@/components/profile/ratings/ratingTickerEmptyStates';

type Props = {
  trackLabel: string;
  ratingTrackId: string;
  currentRating: number | null;
  points: RatingHistoryPoint[];
  badge: PlayerBadgeStateRow | null | undefined;
  isSelf: boolean;
  canLinkFinishedGames: boolean;
};

function fmtRating(value: number | null): string {
  return value == null ? '—' : value.toLocaleString();
}

function fmtSigned(value: number | null): string {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`;
}

function fmtWinRate(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function MetricCell({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'neutral';
  testId?: string;
}) {
  const valueClass =
    tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : 'text-gray-100';
  return (
    <div className="rounded-lg border border-[#23303f] bg-[#0f1723] px-3 py-2" data-testid={testId}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`tabular-nums text-sm font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

export function RatingTrackDetailPanel({
  trackLabel,
  ratingTrackId,
  currentRating,
  points,
  badge,
  isSelf,
  canLinkFinishedGames,
}: Props) {
  const def = timeControlByRatingTrackId(ratingTrackId);
  const isExact = Boolean(def?.badgeTrackKey);
  const showBadgeUnavailable = isExact && !isSelf;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lane, setLane] = useState<RatingLane>(DEFAULT_RATING_LANE);
  const [resultFilter, setResultFilter] = useState<RatingResultFilter>('all');

  const lanePoints = useMemo(() => filterPointsByLane(points, lane), [points, lane]);
  const chartPoints = useMemo(
    () => filterPointsByResult(lanePoints, resultFilter),
    [lanePoints, resultFilter],
  );
  const metrics = useMemo(() => summarizeLaneMetrics(lanePoints), [lanePoints]);

  const allEmpty = points.length === 0;
  const laneEmpty = lanePoints.length === 0;
  const resultFilterEmpty = !laneEmpty && chartPoints.length === 0;
  const exactEmptyHistory = isExact && isSelf && allEmpty;

  const streakText = metrics.currentStreak
    ? `${metrics.currentStreak.length} ${
        metrics.currentStreak.kind === 'win' ? 'W' : metrics.currentStreak.kind === 'loss' ? 'L' : 'D'
      }`
    : '—';
  const streakTone =
    metrics.currentStreak?.kind === 'win'
      ? 'up'
      : metrics.currentStreak?.kind === 'loss'
        ? 'down'
        : 'neutral';

  return (
    <div
      data-testid="rating-track-detail-panel"
      className="space-y-3 rounded-xl border border-[#2f3f54] bg-[#0b121c] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-white">{trackLabel} ticker</h3>
        {chartPoints.length > 0 ? (
          <button
            type="button"
            className="shrink-0 rounded-md border border-[#3d5168] px-2 py-1 text-xs text-gray-300 sm:hidden"
            data-testid="rating-ticker-expand-mobile"
            onClick={() => setDrawerOpen(true)}
          >
            Expand
          </button>
        ) : null}
      </div>

      {!isSelf && isExact ? (
        <p className="m-0 text-xs text-gray-500">{RATING_EXACT_SELF_ONLY}</p>
      ) : null}
      {exactEmptyHistory ? (
        <p className="m-0 text-xs text-gray-500" data-testid="rating-exact-track-history-empty">
          {exactTrackHistoryEmptyLabel(trackLabel)}
        </p>
      ) : null}

      {/* Lane tabs — chart-window filters only (mobile: horizontal scroll, no wrap). */}
      <div
        className="flex gap-1 overflow-x-auto rounded-lg border border-[#23303f] bg-[#0c121c] p-1"
        data-testid="rating-lane-tabs"
        role="tablist"
        aria-label="Rating history window"
      >
        {RATING_LANES.map((l) => {
          const sel = l === lane;
          return (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={sel}
              data-testid={`rating-lane-tab-${l}`}
              data-selected={sel ? 'true' : 'false'}
              onClick={() => setLane(l)}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                sel ? 'bg-sky-950/40 text-sky-300' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {RATING_LANE_LABELS[l]}
            </button>
          );
        })}
      </div>

      {laneEmpty ? (
        allEmpty ? (
          // Preserve existing whole-track empty behavior (current-rating-aware).
          <RatingTickerChart
            points={[]}
            currentRating={currentRating}
            canLinkFinishedGames={canLinkFinishedGames}
          />
        ) : (
          <p className="m-0 text-xs text-gray-500" data-testid="rating-lane-empty">
            {RATING_LANE_EMPTY}
          </p>
        )
      ) : (
        <>
          {/* Headline metric row — derived from authoritative lane points only. */}
          <div className="grid grid-cols-3 gap-2" data-testid="rating-metric-row">
            <MetricCell label="Current" value={fmtRating(metrics.current)} testId="rating-metric-current" />
            <MetricCell label="Peak" value={fmtRating(metrics.peak)} testId="rating-metric-peak" />
            <MetricCell label="Lowest" value={fmtRating(metrics.lowest)} testId="rating-metric-lowest" />
            <MetricCell
              label="Lane Movement"
              value={fmtSigned(metrics.movement)}
              tone={
                metrics.movement == null
                  ? 'neutral'
                  : metrics.movement > 0
                    ? 'up'
                    : metrics.movement < 0
                      ? 'down'
                      : 'neutral'
              }
              testId="rating-metric-movement"
            />
            <MetricCell label="Games" value={metrics.games.toLocaleString()} testId="rating-metric-games" />
            <MetricCell
              label="W / L / D"
              value={`${metrics.counts.wins} / ${metrics.counts.losses} / ${metrics.counts.draws}`}
              testId="rating-metric-wld"
            />
            <MetricCell label="Win Rate" value={fmtWinRate(metrics.winRate)} testId="rating-metric-winrate" />
            <MetricCell
              label="Best Streak"
              value={metrics.bestStreak.toLocaleString()}
              testId="rating-metric-best-streak"
            />
            <MetricCell
              label="Current Streak"
              value={streakText}
              tone={streakTone}
              testId="rating-metric-current-streak"
            />
          </div>

          {/* Result filter tabs — applied to the selected lane's points (chart only). */}
          <div
            className="flex gap-1 overflow-x-auto"
            data-testid="rating-result-filter"
            role="tablist"
            aria-label="Result filter"
          >
            {RATING_RESULT_FILTERS.map((f) => {
              const sel = f === resultFilter;
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={sel}
                  data-testid={`rating-result-filter-${f}`}
                  data-selected={sel ? 'true' : 'false'}
                  onClick={() => setResultFilter(f)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    sel
                      ? 'border-sky-500/60 bg-sky-950/30 text-sky-300'
                      : 'border-[#23303f] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {RATING_RESULT_FILTER_LABELS[f]}
                </button>
              );
            })}
          </div>

          {resultFilterEmpty ? (
            <p className="m-0 text-xs text-gray-500" data-testid="rating-result-filter-empty">
              {resultFilterEmptyLabel(RATING_RESULT_FILTER_LABELS[resultFilter])}
            </p>
          ) : (
            <RatingTickerChart
              points={chartPoints}
              currentRating={metrics.current}
              canLinkFinishedGames={canLinkFinishedGames}
            />
          )}
        </>
      )}

      <BadgeBoundaryPanel badge={badge} showUnavailable={showBadgeUnavailable || (isSelf && isExact)} />
      <ExpandedRatingTickerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        trackLabel={trackLabel}
        currentRating={metrics.current ?? currentRating}
        points={chartPoints}
        canLinkFinishedGames={canLinkFinishedGames}
      />
    </div>
  );
}
