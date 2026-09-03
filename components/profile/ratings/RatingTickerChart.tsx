'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  chartPointMarkerForPoint,
  chartPointMarkerLegendKinds,
  chartPointMarkerStyle,
} from '@/lib/ratingTickerChartMarkers';
import { finishedGameHref, finishedGameTrainHref } from '@/lib/profileRatingFinishedLinks';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import {
  landscapeTickerPathFromPoints,
  landscapeTickerRatingDomain,
  type LandscapeTickerPlotGeometry,
} from '@/lib/profile/landscapeTickerPath';
import type { RatingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import { formatOccurredAtInZone } from '@/lib/profile/ratingTickerTimeZone';
import type { RatingLane } from '@/lib/ratingHistoryMetrics';
import { CompactRatingTickerAxes } from '@/components/profile/ratings/CompactRatingTickerAxes';
import {
  RATING_CURRENT_NO_HISTORY,
  RATING_HISTORY_EMPTY,
} from '@/components/profile/ratings/ratingTickerEmptyStates';

type Props = {
  points: RatingHistoryPoint[];
  currentRating: number | null;
  canLinkFinishedGames: boolean;
  lane: RatingLane;
  window: RatingLaneWindow | null;
  carryInRating?: number | null;
  /** Taller chart when opened in mobile drawer. */
  expanded?: boolean;
};

const CHART_W = 560;
const CHART_H = 160;
const CHART_H_EXPANDED = 220;
const PAD = 30;
const TOP_AXIS_BAND = 34;

export function RatingTickerChart({
  points,
  currentRating,
  canLinkFinishedGames,
  lane,
  window: laneWindow,
  carryInRating = null,
  expanded = false,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const chartH = expanded ? CHART_H_EXPANDED : CHART_H;

  const sorted = useMemo(
    () => [...points].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    [points],
  );

  const legendKinds = useMemo(() => chartPointMarkerLegendKinds(sorted), [sorted]);

  const hasCarryIn = typeof carryInRating === 'number' && Number.isFinite(carryInRating);
  if ((sorted.length === 0 && !hasCarryIn) || !laneWindow) {
    const msg =
      typeof currentRating === 'number' && Number.isFinite(currentRating)
        ? RATING_CURRENT_NO_HISTORY
        : RATING_HISTORY_EMPTY;
    return (
      <div
        data-testid="rating-ticker-chart-empty"
        className="rounded-lg border border-dashed border-[#38506e] bg-[#0b121c] px-4 py-6 text-sm text-gray-400"
      >
        {msg}
      </div>
    );
  }

  const ratingDomain = landscapeTickerRatingDomain(
    [sorted],
    [currentRating, carryInRating].filter((n): n is number => typeof n === 'number'),
  )!;
  const geometry: LandscapeTickerPlotGeometry = {
    width: CHART_W,
    height: chartH,
    pad: PAD,
    topAxisBand: TOP_AXIS_BAND,
    minT: laneWindow.startMs,
    maxT: laneWindow.endMs,
    minR: ratingDomain.minR,
    maxR: ratingDomain.maxR,
  };
  const path = landscapeTickerPathFromPoints(sorted, geometry, { carryInRating });

  const active = sorted.find((p) => p.id === activeId) ?? sorted[sorted.length - 1];
  const activeMarker = active ? chartPointMarkerForPoint(active) : 'none';

  return (
    <div
      data-testid="rating-ticker-chart"
      data-lane={lane}
      data-time-caption={laneWindow.caption}
      data-carry-in-only={path?.plotted.length === 0 ? 'true' : 'false'}
      className="space-y-2"
    >
      {legendKinds.length > 0 ? (
        <ul
          className="m-0 flex list-none flex-wrap gap-2 p-0 text-[10px] text-gray-400"
          data-testid="rating-ticker-chart-legend"
        >
          {legendKinds.map((kind) => {
            const sample = sorted.find((p) => chartPointMarkerForPoint(p) === kind);
            const label = sample ? chartPointMarkerStyle(sample, false).label : kind;
            return (
              <li key={kind} className="rounded border border-[#2f3f54] px-1.5 py-0.5">
                {label}
              </li>
            );
          })}
        </ul>
      ) : null}
      <svg
        viewBox={`0 0 ${CHART_W} ${chartH}`}
        className="w-full max-w-full rounded-lg border border-[#2f3f54] bg-[#0b121c]"
        role="img"
        aria-label={`Rating history chart, ${lane} lane, ${laneWindow.caption}`}
      >
        <CompactRatingTickerAxes
          geometry={geometry}
          lane={lane}
          window={laneWindow}
          testIdPrefix="compact-rating"
        />
        {path ? (
          <path
            data-testid="rating-ticker-series-path"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d={path.d}
          />
        ) : null}
        {(path?.plotted ?? []).map(({ point: p, x, y }) => {
          const style = chartPointMarkerStyle(p, active?.id === p.id);
          const r = active?.id === p.id ? 7 : style.showRing ? 5 : 4;
          return (
            <g key={p.id}>
              {style.showRing ? (
                <circle
                  cx={x}
                  cy={y}
                  r={r + 3}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth="1.5"
                  opacity={0.85}
                />
              ) : null}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth="1"
                data-marker-kind={style.kind}
                data-testid="rating-ticker-point"
                data-occurred-at={p.occurredAt}
                className="cursor-pointer"
                onClick={() => setActiveId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setActiveId(p.id);
                }}
                role="button"
                tabIndex={0}
                aria-label={`Rating ${p.ratingAfter}${style.label ? `, ${style.label}` : ''}`}
              />
            </g>
          );
        })}
      </svg>
      {active ? (
        <div
          data-testid="rating-ticker-point-detail"
          data-marker-kind={activeMarker}
          className="rounded-lg border border-[#2f3f54] bg-[#0f1723] px-3 py-2 text-sm text-gray-200"
        >
          <p className="m-0 tabular-nums">
            {active.ratingBefore} → {active.ratingAfter}{' '}
            <span className={active.ratingDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              ({active.ratingDelta >= 0 ? '+' : ''}
              {active.ratingDelta})
            </span>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {formatOccurredAtInZone(active.occurredAt, laneWindow.timeZone)} {laneWindow.timeZone} ·{' '}
            {active.result}
            {active.badgeStateAfter ? ` · badge ${active.badgeStateAfter}` : ''}
            {active.badgeEvent && active.badgeEvent !== 'none' ? ` · ${active.badgeEvent}` : ''}
            {active.streakAfter != null ? ` · streak ${active.streakAfter}` : ''}
          </p>
          {canLinkFinishedGames && active.gameId ? (
            <p className="mt-2 mb-0 flex flex-wrap gap-x-3 gap-y-1">
              <Link
                href={finishedGameHref(active.gameId)}
                data-testid="rating-point-finished-link"
                className="inline-flex min-h-9 items-center rounded-md border border-sky-400/60 bg-sky-400/10 px-3 py-1.5 font-semibold text-sky-200 hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                Open game
              </Link>
              <Link
                href={finishedGameTrainHref(active.gameId)}
                data-testid="rating-point-train-link"
                className="font-semibold text-sky-300"
              >
                Trainer review
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
