'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { CompactRatingTickerAxes } from '@/components/profile/ratings/CompactRatingTickerAxes';
import {
  MULTI_LINE_CHART_H_EXPANDED,
  MULTI_LINE_CHART_PAD,
  MULTI_LINE_CHART_W,
} from '@/components/profile/ratings/MultiLineRatingTickerChart';
import {
  canLinkCompareEvent,
  compareResultLabel,
  type CompareBucketLane,
  type CompareSeriesId,
} from '@/lib/profile/compareMode';
import {
  landscapeTickerPathFromPoints,
  landscapeTickerRatingDomain,
  type LandscapeTickerPlotGeometry,
} from '@/lib/profile/landscapeTickerPath';
import {
  mergeAlignedTimestamp,
  mergeRatingAtPosition,
} from '@/lib/profile/mergeCompareAlignment';
import { nearestMergePoint } from '@/lib/profile/mergePointerSelection';
import { formatOccurredAtInZone } from '@/lib/profile/ratingTickerTimeZone';
import type { RatingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import { finishedGameHref, finishedGameTrainHref } from '@/lib/profileRatingFinishedLinks';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

export type ExpandedMergeSeries = {
  id: CompareSeriesId;
  label: string;
  rank: number;
  color: string;
  dashArray?: string;
  points: RatingHistoryPoint[];
  carryInRating: number | null;
  sourceWindow: RatingLaneWindow;
  periodCaption: string;
  coverage: 'loading' | 'complete' | 'incomplete';
  coverageMessage?: string;
};

type Props = {
  series: ExpandedMergeSeries[];
  targetWindow: RatingLaneWindow;
  canLinkFinishedGames: boolean;
  nowMs: number;
};

type PlottedPoint = {
  series: ExpandedMergeSeries;
  point: RatingHistoryPoint;
  x: number;
  y: number;
};

const TOP_AXIS_BAND = 42;

function observedThroughMs(
  entry: ExpandedMergeSeries,
  targetWindow: RatingLaneWindow,
  nowMs: number,
): number {
  if (nowMs < entry.sourceWindow.startMs) return targetWindow.startMs;
  if (nowMs >= entry.sourceWindow.endMs) return targetWindow.endMs;
  return mergeAlignedTimestamp(
    nowMs,
    entry.sourceWindow,
    targetWindow,
    targetWindow.lane as CompareBucketLane,
  );
}

export const MERGE_COMPARE_STYLE: Record<CompareSeriesId, { color: string; dashArray?: string }> = {
  main: { color: '#34d399' },
  ct1: { color: '#f472b6', dashArray: '9 4' },
  ct2: { color: '#fbbf24', dashArray: '3 3' },
  ct3: { color: '#a78bfa', dashArray: '11 3 2 3' },
};

export function ExpandedMergeCompareChart({
  series,
  targetWindow,
  canLinkFinishedGames,
  nowMs,
}: Props) {
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const [active, setActive] = useState<{ seriesId: CompareSeriesId; pointId: string } | null>(null);

  const plotted = useMemo(() => {
    const carryRatings = series
      .map((entry) => entry.carryInRating)
      .filter((rating): rating is number => typeof rating === 'number' && Number.isFinite(rating));
    const ratingDomain = landscapeTickerRatingDomain(series.map((entry) => entry.points), carryRatings);
    if (!ratingDomain) {
      return {
        paths: new Map<CompareSeriesId, string>(),
        points: [] as PlottedPoint[],
        geometry: null as LandscapeTickerPlotGeometry | null,
      };
    }
    const geometry: LandscapeTickerPlotGeometry = {
      width: MULTI_LINE_CHART_W,
      height: MULTI_LINE_CHART_H_EXPANDED,
      pad: MULTI_LINE_CHART_PAD,
      topAxisBand: TOP_AXIS_BAND,
      minT: targetWindow.startMs,
      maxT: targetWindow.endMs,
      minR: ratingDomain.minR,
      maxR: ratingDomain.maxR,
    };
    const paths = new Map<CompareSeriesId, string>();
    const plottedPoints: PlottedPoint[] = [];
    for (const entry of series) {
      const originals = new Map(entry.points.map((point) => [point.id, point]));
      const alignedPoints = entry.points.map((point) => {
        const eventMs = Date.parse(point.occurredAt);
        return {
          ...point,
          occurredAt: new Date(mergeAlignedTimestamp(
            eventMs,
            entry.sourceWindow,
            targetWindow,
            targetWindow.lane as CompareBucketLane,
          )).toISOString(),
        };
      });
      const path = landscapeTickerPathFromPoints(alignedPoints, geometry, {
        carryInRating: entry.carryInRating,
        holdUntilMs: observedThroughMs(entry, targetWindow, nowMs),
      });
      if (!path) continue;
      paths.set(entry.id, path.d);
      for (const aligned of path.plotted) {
        const original = originals.get(aligned.point.id);
        if (original) {
          plottedPoints.push({ series: entry, point: original, x: aligned.x, y: aligned.y });
        }
      }
    }
    return { paths, points: plottedPoints, geometry };
  }, [nowMs, series, targetWindow]);

  const activePoint = useMemo(() => {
    if (!active) return null;
    return plotted.points.find(
      (entry) => entry.series.id === active.seriesId && entry.point.id === active.pointId,
    ) ?? null;
  }, [active, plotted.points]);

  const hoverRows = useMemo(() => {
    if (hoverFraction == null) return [];
    const targetSpan = Math.max(1, targetWindow.endMs - targetWindow.startMs);
    const targetMs = targetWindow.startMs + hoverFraction * targetSpan;
    return series.map((entry) => {
      const isBeyondVerifiedHistory = targetMs > observedThroughMs(entry, targetWindow, nowMs);
      const points = isBeyondVerifiedHistory ? [] : entry.points;
      const carryInRating = isBeyondVerifiedHistory ? null : entry.carryInRating;
      return {
        entry,
        state: mergeRatingAtPosition(
          points,
          carryInRating,
          entry.sourceWindow,
          targetWindow,
          targetWindow.lane as CompareBucketLane,
          hoverFraction,
        ),
      };
    });
  }, [hoverFraction, nowMs, series, targetWindow]);

  function pointerFraction(clientX: number, svg: SVGSVGElement): number {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const x = ((clientX - rect.left) / rect.width) * MULTI_LINE_CHART_W;
    const inner = MULTI_LINE_CHART_W - MULTI_LINE_CHART_PAD * 2;
    return Math.min(1, Math.max(0, (x - MULTI_LINE_CHART_PAD) / inner));
  }

  function activateNearest(
    clientX: number,
    clientY: number,
    svg: SVGSVGElement,
  ) {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((clientX - rect.left) / rect.width) * MULTI_LINE_CHART_W;
    const y = ((clientY - rect.top) / rect.height) * MULTI_LINE_CHART_H_EXPANDED;
    const best = nearestMergePoint(plotted.points, x, y);
    if (best) setActive({ seriesId: best.series.id, pointId: best.point.id });
  }

  const legend = (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Merged comparison series">
      {series.map((entry) => (
        <li
          key={entry.id}
          className="rounded-full border border-[#3d5168] bg-[#0b121c] px-2.5 py-1 text-xs text-gray-200"
          data-testid={`expanded-merge-legend-${entry.id}`}
          data-coverage={entry.coverage}
          title={[entry.periodCaption, entry.coverageMessage].filter(Boolean).join(' · ')}
        >
          <span className="mr-1.5 inline-block w-6 align-middle" aria-hidden="true">
            <svg viewBox="0 0 24 4" className="h-2 w-6">
              <path d="M 1 2 L 23 2" stroke={entry.color} strokeWidth={entry.id === 'main' ? 3 : 2.5} strokeDasharray={entry.dashArray} />
            </svg>
          </span>
          {entry.label} · rank {entry.rank}
          {entry.coverage === 'loading'
            ? ' · verifying history'
            : entry.coverage === 'incomplete'
              ? ' · coverage incomplete'
              : ''}
        </li>
      ))}
    </ul>
  );

  const rootData = {
    'data-series-order': series.map((entry) => entry.id).join(' '),
    'data-lane': targetWindow.lane,
    'data-y-axis': 'absolute-elo',
  } as const;

  if (!plotted.geometry || plotted.paths.size === 0) {
    return (
      <div className="space-y-3" data-testid="expanded-merge-chart" {...rootData}>
        {legend}
        <p className="m-0 rounded-lg border border-[#2f3f54] bg-[#0b121c] p-4 text-sm text-gray-400" data-testid="expanded-merge-empty">
          No verified rating history is available for these periods.
        </p>
        <p className="m-0 text-xs text-gray-400" data-testid="expanded-merge-alignment-note">
          Calendar aligned by {targetWindow.lane}; ratings use one absolute ELO scale. Each event keeps its original UTC date.
        </p>
      </div>
    );
  }

  const paintOrder = [...series].reverse();

  return (
    <div className="space-y-3" data-testid="expanded-merge-chart" {...rootData}>
      {legend}

      <div className="relative">
        <svg
          viewBox={`0 0 ${MULTI_LINE_CHART_W} ${MULTI_LINE_CHART_H_EXPANDED}`}
          className="w-full max-w-full touch-none rounded-lg border border-[#2f3f54] bg-[#0b121c]"
          role="img"
          aria-label={`Merged rating comparison, ${targetWindow.lane} calendar alignment, absolute ELO`}
          data-testid="expanded-merge-chart-svg"
          onPointerMove={(event) => setHoverFraction(pointerFraction(event.clientX, event.currentTarget))}
          onPointerLeave={() => setHoverFraction(null)}
          onClick={(event) => activateNearest(event.clientX, event.clientY, event.currentTarget)}
        >
          <CompactRatingTickerAxes
            geometry={plotted.geometry}
            lane={targetWindow.lane}
            window={targetWindow}
            testIdPrefix="expanded-merge"
          />
          {paintOrder.map((entry) => {
            const path = plotted.paths.get(entry.id);
            if (!path) return null;
            return (
              <g key={entry.id} data-testid={`expanded-merge-series-group-${entry.id}`} data-rank={entry.rank}>
                <path
                  d={path}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth={entry.id === 'main' ? 3.25 : 2.5}
                  strokeDasharray={entry.dashArray}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                  data-testid={`expanded-merge-series-${entry.id}`}
                />
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  pointerEvents="stroke"
                  data-testid={`expanded-merge-series-hit-${entry.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    const svg = event.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    activateNearest(
                      event.clientX,
                      event.clientY,
                      svg,
                    );
                  }}
                />
                {plotted.points.filter((point) => point.series.id === entry.id).map((point) => {
                  const isActive = active?.seriesId === entry.id && active?.pointId === point.point.id;
                  return (
                    <circle
                      key={`${entry.id}:${point.point.id}`}
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 6 : 4}
                      fill={entry.color}
                      stroke={isActive ? '#ffffff' : entry.color}
                      strokeWidth={isActive ? 2 : 1}
                      role="button"
                      tabIndex={0}
                      aria-label={`${entry.label} rating ${point.point.ratingAfter} on ${point.point.occurredAt}`}
                      data-testid={`expanded-merge-point-${entry.id}`}
                      data-original-occurred-at={point.point.occurredAt}
                      onClick={(event) => {
                        event.stopPropagation();
                        setActive({ seriesId: entry.id, pointId: point.point.id });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setActive({ seriesId: entry.id, pointId: point.point.id });
                        }
                      }}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>

        {hoverRows.length ? (
          <div
            className="pointer-events-none absolute right-2 top-2 max-w-[min(19rem,calc(100%-1rem))] rounded-lg border border-[#3d5168] bg-[#0f1723]/95 p-2 text-xs text-gray-200 shadow-xl"
            data-testid="expanded-merge-tooltip"
          >
            <p className="m-0 mb-1 font-semibold text-white">Aligned calendar position</p>
            <ul className="m-0 list-none space-y-1 p-0">
              {hoverRows.map(({ entry, state }) => (
                <li key={entry.id} data-testid={`expanded-merge-tooltip-${entry.id}`}>
                  <span className="font-semibold" style={{ color: entry.color }}>{entry.label}</span>{' '}
                  <span className="tabular-nums">{state.rating == null ? 'No verified rating' : state.rating}</span>
                  <span className="block text-[10px] text-gray-400">
                    {formatOccurredAtInZone(new Date(state.mappedMs).toISOString(), entry.sourceWindow.timeZone)} {entry.sourceWindow.timeZone}
                    {state.fromCarryIn ? ' · carry-in' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className="m-0 text-xs text-gray-400" data-testid="expanded-merge-alignment-note">
        Calendar aligned by {targetWindow.lane}; ratings use one absolute ELO scale. Each event keeps its original UTC date.
      </p>

      {activePoint ? (
        <div className="rounded-lg border border-[#2f3f54] bg-[#0f1723] p-3 text-sm text-gray-200" data-testid="expanded-merge-point-detail">
          <p className="m-0 font-semibold" style={{ color: activePoint.series.color }}>{activePoint.series.label}</p>
          <p className="m-0 mt-1 tabular-nums">
            {activePoint.point.ratingBefore} → {activePoint.point.ratingAfter}{' '}
            ({activePoint.point.ratingDelta >= 0 ? '+' : ''}{activePoint.point.ratingDelta})
          </p>
          <p className="m-0 mt-1 text-xs text-gray-400">
            {formatOccurredAtInZone(activePoint.point.occurredAt, activePoint.series.sourceWindow.timeZone)}{' '}
            {activePoint.series.sourceWindow.timeZone} · {compareResultLabel(activePoint.point)}
          </p>
          {canLinkFinishedGames && canLinkCompareEvent(activePoint.point) ? (
            <p className="m-0 mt-2 flex flex-wrap gap-3">
              <Link href={finishedGameHref(activePoint.point.gameId)} className="font-semibold text-sky-300">Open game</Link>
              <Link href={finishedGameTrainHref(activePoint.point.gameId)} className="font-semibold text-sky-300">Trainer review</Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
