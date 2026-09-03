'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { MajorFamilySeriesData } from '@/lib/profileRatingChartLevels';
import { frontMostId, sortItemsByDominance } from '@/lib/profile/ratingLineDominanceOrder';
import { pointsAtExactTimestamp } from '@/lib/profileRatingFamilyComparison';
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

type Props = {
  series: MajorFamilySeriesData[];
  visibleTrackIds: ReadonlySet<string>;
  dominanceOrder: readonly string[];
  canLinkFinishedGames: boolean;
  lane: RatingLane;
  window: RatingLaneWindow | null;
  carryInRatings: Readonly<Record<string, number | null>>;
  expanded?: boolean;
};

export const MULTI_LINE_CHART_W = 560;
export const MULTI_LINE_CHART_H = 180;
export const MULTI_LINE_CHART_H_EXPANDED = 240;
export const MULTI_LINE_CHART_PAD = 30;
const MULTI_LINE_TOP_AXIS_BAND = 34;

type PlottedPoint = {
  trackId: string;
  label: string;
  color: string;
  point: RatingHistoryPoint;
  x: number;
  y: number;
};

function pickNearestPoint(
  pts: PlottedPoint[],
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
): PlottedPoint | null {
  if (pts.length === 0) return null;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return pts[0] ?? null;
  const viewH = Number(svg.viewBox.baseVal.height) || MULTI_LINE_CHART_H;
  const x = ((clientX - rect.left) / rect.width) * MULTI_LINE_CHART_W;
  const y = ((clientY - rect.top) / rect.height) * viewH;
  let best = pts[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const pt of pts) {
    const dist = (pt.x - x) ** 2 + (pt.y - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = pt;
    }
  }
  return best;
}

export function MultiLineRatingTickerChart({
  series,
  visibleTrackIds,
  dominanceOrder,
  canLinkFinishedGames,
  lane,
  window: laneWindow,
  carryInRatings,
  expanded = false,
}: Props) {
  const chartH = expanded ? MULTI_LINE_CHART_H_EXPANDED : MULTI_LINE_CHART_H;
  const [active, setActive] = useState<{ trackId: string; pointId: string } | null>(null);
  const [hoverAt, setHoverAt] = useState<string | null>(null);

  const plotted = useMemo(() => {
    const visible = series.filter((s) => visibleTrackIds.has(s.trackId));
    const carryRatings = visible
      .map((s) => carryInRatings[s.trackId])
      .filter((rating): rating is number => typeof rating === 'number' && Number.isFinite(rating));
    const ratingDomain = landscapeTickerRatingDomain(
      visible.map((s) => s.points),
      carryRatings,
    );
    if (!laneWindow || !ratingDomain) {
      return {
        items: [] as PlottedPoint[],
        paths: new Map<string, string>(),
        geometry: null as LandscapeTickerPlotGeometry | null,
      };
    }

    const geometry: LandscapeTickerPlotGeometry = {
      width: MULTI_LINE_CHART_W,
      height: chartH,
      pad: MULTI_LINE_CHART_PAD,
      topAxisBand: MULTI_LINE_TOP_AXIS_BAND,
      minT: laneWindow.startMs,
      maxT: laneWindow.endMs,
      minR: ratingDomain.minR,
      maxR: ratingDomain.maxR,
    };
    const items: PlottedPoint[] = [];
    const paths = new Map<string, string>();
    for (const s of visible) {
      const path = landscapeTickerPathFromPoints(s.points, geometry, {
        carryInRating: carryInRatings[s.trackId],
      });
      if (!path) continue;
      paths.set(s.trackId, path.d);
      items.push(
        ...path.plotted.map(({ point, x, y }) => ({
          trackId: s.trackId,
          label: s.label,
          color: s.color,
          point,
          x,
          y,
        })),
      );
    }

    return { items, paths, geometry };
  }, [series, visibleTrackIds, chartH, carryInRatings, laneWindow]);

  const visibleSeries = useMemo(() => {
    const visible = series.filter((s) => visibleTrackIds.has(s.trackId));
    return sortItemsByDominance(visible, dominanceOrder, (s) => s.trackId);
  }, [series, visibleTrackIds, dominanceOrder]);

  const paintedSeries = useMemo(
    () => visibleSeries.filter((s) => plotted.paths.has(s.trackId)),
    [visibleSeries, plotted.paths],
  );
  const dominantCategory = paintedSeries[paintedSeries.length - 1]?.trackId ?? frontMostId(dominanceOrder);

  const activePoint = useMemo(() => {
    if (!active) return null;
    return plotted.items.find((p) => p.trackId === active.trackId && p.point.id === active.pointId) ?? null;
  }, [active, plotted.items]);

  const hoverRows = useMemo(() => {
    if (!hoverAt) return [];
    const rows = pointsAtExactTimestamp(series, hoverAt, visibleTrackIds);
    return sortItemsByDominance(rows, dominanceOrder, (row) => row.trackId);
  }, [hoverAt, series, visibleTrackIds, dominanceOrder]);

  if (plotted.paths.size === 0 || !plotted.geometry || !laneWindow) {
    return null;
  }

  return (
    <div
      data-testid="multi-line-rating-chart"
      data-dominance-order={visibleSeries.map((s) => s.trackId).join(' ') || 'none'}
      data-dominant-category={dominantCategory ?? 'none'}
      data-lane={lane}
      data-time-caption={laneWindow.caption}
      data-hero="false"
      className="space-y-2"
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${MULTI_LINE_CHART_W} ${chartH}`}
          className="w-full max-w-full rounded-lg border border-[#2f3f54] bg-[#0b121c]"
          role="img"
          aria-label={`Major rating families comparison chart, ${lane} lane, ${laneWindow.caption}`}
          data-testid="multi-line-rating-chart-svg"
          onMouseLeave={() => setHoverAt(null)}
        >
          <CompactRatingTickerAxes
            geometry={plotted.geometry}
            lane={lane}
            window={laneWindow}
            testIdPrefix="compact-comparison"
          />
          {visibleSeries.map((s, index) => {
            const pts = plotted.items.filter((p) => p.trackId === s.trackId);
            const path = plotted.paths.get(s.trackId);
            if (!path) return null;
            const isDominant = s.trackId === dominantCategory;
            const activateNearest = (clientX: number, clientY: number, svg: SVGSVGElement | null) => {
              if (!svg) return;
              const nearest = pickNearestPoint(pts, clientX, clientY, svg);
              if (!nearest) return;
              setActive({ trackId: nearest.trackId, pointId: nearest.point.id });
              setHoverAt(nearest.point.occurredAt);
            };
            return (
              <g
                key={s.trackId}
                data-testid={`multi-line-series-group-${s.trackId}`}
                data-dominance-rank={index}
                data-dominant={isDominant ? 'true' : 'false'}
              >
                <path
                  data-testid={`multi-line-series-${s.trackId}`}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={isDominant ? 2.75 : 2}
                  strokeOpacity={0.95}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={path}
                  pointerEvents="none"
                />
                <path
                  data-testid={`multi-line-series-hit-${s.trackId}`}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  d={path}
                  pointerEvents="stroke"
                  onClick={(event) => {
                    event.stopPropagation();
                    activateNearest(event.clientX, event.clientY, event.currentTarget.ownerSVGElement);
                  }}
                />
                {pts.map((p) => {
                  const isActive =
                    active?.trackId === p.trackId && active?.pointId === p.point.id;
                  const isHover = hoverAt === p.point.occurredAt;
                  return (
                    <circle
                      key={`${p.trackId}:${p.point.id}`}
                      cx={p.x}
                      cy={p.y}
                      r={isActive ? 6 : 4}
                      fill={p.color}
                      stroke={isActive || isHover ? '#ffffff' : p.color}
                      strokeWidth={isActive || isHover ? 2 : 1}
                      className="cursor-pointer"
                      data-testid={`multi-line-point-${p.trackId}`}
                      data-point-id={p.point.id}
                      data-rating-after={p.point.ratingAfter}
                      data-occurred-at={p.point.occurredAt}
                      onClick={() => setActive({ trackId: p.trackId, pointId: p.point.id })}
                      onMouseEnter={() => setHoverAt(p.point.occurredAt)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setActive({ trackId: p.trackId, pointId: p.point.id });
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${p.label} rating ${p.point.ratingAfter}`}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>

        {hoverRows.length > 0 ? (
          <div
            data-testid="multi-line-hover-tooltip"
            className="pointer-events-none absolute right-2 top-2 max-w-[220px] rounded-lg border border-[#2f3f54] bg-[#0f1723]/95 px-2 py-1.5 text-xs text-gray-200 shadow-lg"
          >
            <p className="m-0 mb-1 text-[10px] text-gray-400">
              {formatOccurredAtInZone(
                hoverRows[0].point.occurredAt,
                laneWindow.timeZone,
              )}{' '}
              {laneWindow.timeZone}
            </p>
            <ul className="m-0 list-none space-y-0.5 p-0">
              {hoverRows.map((row) => (
                <li key={row.trackId} className="flex items-center justify-between gap-2 tabular-nums">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    {row.label}
                  </span>
                  <span>{row.point.ratingAfter.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {activePoint ? (
        <div
          data-testid="multi-line-point-detail"
          className="rounded-lg border border-[#2f3f54] bg-[#0f1723] px-3 py-2 text-sm text-gray-200"
        >
          <p className="m-0 flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: activePoint.color }}
            />
            <span className="font-medium">{activePoint.label}</span>
          </p>
          <p className="m-0 mt-1 tabular-nums">
            {activePoint.point.ratingBefore} → {activePoint.point.ratingAfter}{' '}
            <span
              className={
                activePoint.point.ratingDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }
            >
              ({activePoint.point.ratingDelta >= 0 ? '+' : ''}
              {activePoint.point.ratingDelta})
            </span>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {formatOccurredAtInZone(activePoint.point.occurredAt, laneWindow.timeZone)}{' '}
            {laneWindow.timeZone} ·{' '}
            {activePoint.point.result}
          </p>
          {canLinkFinishedGames && activePoint.point.gameId ? (
            <p className="mt-2 mb-0 flex flex-wrap gap-x-3 gap-y-1">
              <Link
                href={finishedGameHref(activePoint.point.gameId)}
                data-testid="multi-line-finished-link"
                className="inline-flex min-h-9 items-center rounded-md border border-sky-400/60 bg-sky-400/10 px-3 py-1.5 font-semibold text-sky-200 hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                Open game
              </Link>
              <Link
                href={finishedGameTrainHref(activePoint.point.gameId)}
                data-testid="multi-line-train-link"
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
