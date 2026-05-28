'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import {
  RATING_CURRENT_NO_HISTORY,
  RATING_HISTORY_EMPTY,
} from '@/components/profile/ratings/ratingTickerEmptyStates';

type Props = {
  points: RatingHistoryPoint[];
  currentRating: number | null;
  canLinkFinishedGames: boolean;
};

const CHART_W = 560;
const CHART_H = 160;
const PAD = 16;

export function RatingTickerChart({ points, currentRating, canLinkFinishedGames }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...points].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    [points],
  );

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
    return CHART_H - PAD - t * (CHART_H - PAD * 2);
  };

  const polyline =
    sorted.length === 1
      ? `${toX(0)},${toY(sorted[0].ratingAfter)} ${toX(0)},${toY(sorted[0].ratingAfter)}`
      : sorted.map((p, i) => `${toX(i)},${toY(p.ratingAfter)}`).join(' ');

  const active = sorted.find((p) => p.id === activeId) ?? sorted[sorted.length - 1];

  return (
    <div data-testid="rating-ticker-chart" className="space-y-2">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full max-w-full rounded-lg border border-[#2f3f54] bg-[#0b121c]"
        role="img"
        aria-label="Rating history chart"
      >
        <polyline
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2"
          points={polyline}
        />
        {sorted.map((p, i) => (
          <circle
            key={p.id}
            cx={toX(i)}
            cy={toY(p.ratingAfter)}
            r={active?.id === p.id ? 6 : 4}
            fill={active?.id === p.id ? '#fbbf24' : '#38bdf8'}
            className="cursor-pointer"
            onClick={() => setActiveId(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setActiveId(p.id);
            }}
            role="button"
            tabIndex={0}
            aria-label={`Rating ${p.ratingAfter} on ${new Date(p.occurredAt).toLocaleDateString()}`}
          />
        ))}
      </svg>
      {active ? (
        <div
          data-testid="rating-ticker-point-detail"
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
          </p>
          {canLinkFinishedGames && active.gameId ? (
            <p className="mt-2 mb-0">
              <Link href={`/game/${active.gameId}`} className="font-semibold text-sky-300">
                Open finished game
              </Link>
              {' · '}
              <Link href="/trainer/review" className="font-semibold text-sky-300">
                Trainer review
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
