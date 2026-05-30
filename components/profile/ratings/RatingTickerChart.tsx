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
  RATING_CURRENT_NO_HISTORY,
  RATING_HISTORY_EMPTY,
} from '@/components/profile/ratings/ratingTickerEmptyStates';

type Props = {
  points: RatingHistoryPoint[];
  currentRating: number | null;
  canLinkFinishedGames: boolean;
  /** Taller chart when opened in mobile drawer. */
  expanded?: boolean;
};

const CHART_W = 560;
const CHART_H = 160;
const CHART_H_EXPANDED = 220;
const PAD = 16;

export function RatingTickerChart({
  points,
  currentRating,
  canLinkFinishedGames,
  expanded = false,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const chartH = expanded ? CHART_H_EXPANDED : CHART_H;

  const sorted = useMemo(
    () => [...points].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    [points],
  );

  const legendKinds = useMemo(() => chartPointMarkerLegendKinds(sorted), [sorted]);

  if (sorted.length === 0) {
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

  const ratings = sorted.map((p) => p.ratingAfter);
  const minR = Math.min(...ratings, ...(currentRating != null ? [currentRating] : []));
  const maxR = Math.max(...ratings, ...(currentRating != null ? [currentRating] : []));
  const span = Math.max(maxR - minR, 40);
  const yMin = minR - span * 0.08;
  const yMax = maxR + span * 0.08;

  const toX = (i: number) =>
    sorted.length === 1
      ? CHART_W / 2
      : PAD + (i / (sorted.length - 1)) * (CHART_W - PAD * 2);
  const toY = (r: number) => {
    const t = (r - yMin) / (yMax - yMin);
    return chartH - PAD - t * (chartH - PAD * 2);
  };

  const polyline =
    sorted.length === 1
      ? `${toX(0)},${toY(sorted[0].ratingAfter)} ${toX(0)},${toY(sorted[0].ratingAfter)}`
      : sorted.map((p, i) => `${toX(i)},${toY(p.ratingAfter)}`).join(' ');

  const active = sorted.find((p) => p.id === activeId) ?? sorted[sorted.length - 1];
  const activeMarker = active ? chartPointMarkerForPoint(active) : 'none';

  const peakIdx = ratings.reduce((bi, r, i) => (r > ratings[bi] ? i : bi), 0);
  const lowIdx = ratings.reduce((bi, r, i) => (r < ratings[bi] ? i : bi), 0);
  const lastIdx = sorted.length - 1;
  const clampLabelX = (x: number) => Math.min(CHART_W - PAD, Math.max(PAD, x));

  return (
    <div data-testid="rating-ticker-chart" className="space-y-2">
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
        aria-label="Rating history chart"
      >
        <polyline fill="none" stroke="#38bdf8" strokeWidth="2" points={polyline} />
        {sorted.map((p, i) => {
          const style = chartPointMarkerStyle(p, active?.id === p.id);
          const r = active?.id === p.id ? 7 : style.showRing ? 5 : 4;
          return (
            <g key={p.id}>
              {style.showRing ? (
                <circle
                  cx={toX(i)}
                  cy={toY(p.ratingAfter)}
                  r={r + 3}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth="1.5"
                  opacity={0.85}
                />
              ) : null}
              <circle
                cx={toX(i)}
                cy={toY(p.ratingAfter)}
                r={r}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth="1"
                data-marker-kind={style.kind}
                className="cursor-pointer"
                onClick={() => setActiveId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setActiveId(p.id);
                }}
                role="button"
                tabIndex={0}
                data-badge-event={p.badgeEvent && p.badgeEvent !== 'none' ? p.badgeEvent : undefined}
                aria-label={`Rating ${p.ratingAfter}${style.label ? `, ${style.label}` : ''}`}
              />
            </g>
          );
        })}
        {/* Peak marker (highest visible authoritative point). */}
        <g data-testid="rating-ticker-peak-marker">
          <circle
            cx={toX(peakIdx)}
            cy={toY(ratings[peakIdx])}
            r={4}
            fill="#4ade80"
            stroke="#ffffff"
            strokeWidth="1"
          />
          <text
            x={clampLabelX(toX(peakIdx))}
            y={Math.max(10, toY(ratings[peakIdx]) - 7)}
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#86efac"
          >
            {ratings[peakIdx].toLocaleString()}
          </text>
        </g>
        {/* Lowest marker (lowest visible authoritative point). */}
        <g data-testid="rating-ticker-low-marker">
          <circle
            cx={toX(lowIdx)}
            cy={toY(ratings[lowIdx])}
            r={4}
            fill="#f87171"
            stroke="#ffffff"
            strokeWidth="1"
          />
          <text
            x={clampLabelX(toX(lowIdx))}
            y={Math.min(chartH - 4, toY(ratings[lowIdx]) + 14)}
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#fca5a5"
          >
            {ratings[lowIdx].toLocaleString()}
          </text>
        </g>
        {/* Current-rating pill on the final visible point. */}
        {(() => {
          const cx = toX(lastIdx);
          const cy = toY(ratings[lastIdx]);
          const label = ratings[lastIdx].toLocaleString();
          const w = 10 + label.length * 7;
          const px = Math.min(CHART_W - w - 2, Math.max(2, cx + 8));
          const py = Math.min(chartH - 18, Math.max(2, cy - 9));
          return (
            <g data-testid="rating-ticker-current-pill">
              <circle
                cx={cx}
                cy={cy}
                r={4}
                fill="#38bdf8"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <rect x={px} y={py} width={w} height={16} rx={4} fill="#0369a1" />
              <text
                x={px + w / 2}
                y={py + 11}
                textAnchor="middle"
                fontSize="10"
                fontWeight="800"
                fill="#e0f2fe"
              >
                {label}
              </text>
            </g>
          );
        })()}
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
            {new Date(active.occurredAt).toLocaleString()} · {active.result}
            {active.badgeStateAfter ? ` · badge ${active.badgeStateAfter}` : ''}
            {active.badgeEvent && active.badgeEvent !== 'none' ? ` · ${active.badgeEvent}` : ''}
            {active.streakAfter != null ? ` · streak ${active.streakAfter}` : ''}
          </p>
          {canLinkFinishedGames && active.gameId ? (
            <p className="mt-2 mb-0 flex flex-wrap gap-x-3 gap-y-1">
              <Link
                href={finishedGameHref(active.gameId)}
                data-testid="rating-point-finished-link"
                className="font-semibold text-sky-300"
              >
                Finished game
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
