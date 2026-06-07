'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { MajorFamilySeriesData } from '@/lib/profileRatingChartLevels';
import { pointsAtExactTimestamp } from '@/lib/profileRatingFamilyComparison';
import { finishedGameHref, finishedGameTrainHref } from '@/lib/profileRatingFinishedLinks';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

type Props = {
  series: MajorFamilySeriesData[];
  visibleTrackIds: ReadonlySet<string>;
  canLinkFinishedGames: boolean;
  expanded?: boolean;
};

const CHART_W = 560;
const CHART_H = 180;
const CHART_H_EXPANDED = 240;
const PAD = 20;

type PlottedPoint = {
  trackId: string;
  label: string;
  color: string;
  point: RatingHistoryPoint;
  x: number;
  y: number;
};

function parseTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

export function MultiLineRatingTickerChart({
  series,
  visibleTrackIds,
  canLinkFinishedGames,
  expanded = false,
}: Props) {
  const chartH = expanded ? CHART_H_EXPANDED : CHART_H;
  const [active, setActive] = useState<{ trackId: string; pointId: string } | null>(null);
  const [hoverAt, setHoverAt] = useState<string | null>(null);

  const plotted = useMemo(() => {
    const visible = series.filter((s) => visibleTrackIds.has(s.trackId));
    const allPoints = visible.flatMap((s) =>
      s.points.map((p) => ({ trackId: s.trackId, label: s.label, color: s.color, point: p })),
    );
    if (allPoints.length === 0) return { items: [] as PlottedPoint[], yMin: 1400, yMax: 1600 };

    const times = allPoints.map((ap) => parseTime(ap.point.occurredAt)).filter((t) => Number.isFinite(t));
    const ratings = allPoints.map((ap) => ap.point.ratingAfter);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const minR = Math.min(...ratings);
    const maxR = Math.max(...ratings);
    const span = Math.max(maxR - minR, 40);
    const yMin = minR - span * 0.08;
    const yMax = maxR + span * 0.08;
    const tSpan = Math.max(maxT - minT, 1);

    const toX = (iso: string) => {
      const t = parseTime(iso);
      if (!Number.isFinite(t)) return CHART_W / 2;
      if (times.length === 1 || minT === maxT) return CHART_W / 2;
      return PAD + ((t - minT) / tSpan) * (CHART_W - PAD * 2);
    };
    const toY = (r: number) => {
      const yT = (r - yMin) / (yMax - yMin);
      return chartH - PAD - yT * (chartH - PAD * 2);
    };

    const items: PlottedPoint[] = allPoints.map((ap) => ({
      ...ap,
      x: toX(ap.point.occurredAt),
      y: toY(ap.point.ratingAfter),
    }));

    return { items, yMin, yMax };
  }, [series, visibleTrackIds, chartH]);

  const activePoint = useMemo(() => {
    if (!active) return null;
    return plotted.items.find((p) => p.trackId === active.trackId && p.point.id === active.pointId) ?? null;
  }, [active, plotted.items]);

  const hoverRows = useMemo(() => {
    if (!hoverAt) return [];
    return pointsAtExactTimestamp(series, hoverAt, visibleTrackIds);
  }, [hoverAt, series, visibleTrackIds]);

  if (plotted.items.length === 0) {
    return null;
  }

  const visibleSeries = series.filter((s) => visibleTrackIds.has(s.trackId));

  return (
    <div data-testid="multi-line-rating-chart" className="space-y-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_W} ${chartH}`}
          className="w-full max-w-full rounded-lg border border-[#2f3f54] bg-[#0b121c]"
          role="img"
          aria-label="Major rating families comparison chart"
          onMouseLeave={() => setHoverAt(null)}
        >
          {visibleSeries.map((s) => {
            const pts = plotted.items.filter((p) => p.trackId === s.trackId);
            if (pts.length === 0) return null;
            const polyline =
              pts.length === 1
                ? `${pts[0].x},${pts[0].y} ${pts[0].x},${pts[0].y}`
                : pts.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <polyline
                key={s.trackId}
                data-testid={`multi-line-series-${s.trackId}`}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeOpacity={0.9}
                points={polyline}
              />
            );
          })}

          {plotted.items.map((p) => {
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
        </svg>

        {hoverRows.length > 0 ? (
          <div
            data-testid="multi-line-hover-tooltip"
            className="pointer-events-none absolute right-2 top-2 max-w-[220px] rounded-lg border border-[#2f3f54] bg-[#0f1723]/95 px-2 py-1.5 text-xs text-gray-200 shadow-lg"
          >
            <p className="m-0 mb-1 text-[10px] text-gray-400">
              {new Date(hoverRows[0].point.occurredAt).toLocaleString()}
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
            {new Date(activePoint.point.occurredAt).toLocaleString()} · {activePoint.point.result}
          </p>
          {canLinkFinishedGames && activePoint.point.gameId ? (
            <p className="mt-2 mb-0 flex flex-wrap gap-x-3 gap-y-1">
              <Link
                href={finishedGameHref(activePoint.point.gameId)}
                data-testid="multi-line-finished-link"
                className="font-semibold text-sky-300"
              >
                Finished game
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
