import { useMemo } from 'react';
import type { RatingBucketView, RatingGamePointSnapshot, RatingPeriodFilter } from '@/lib/profile/ratingDashboardTypes';
import { bucketHasAuthoritativeRatingHistory, hasEnoughRatingChartPoints } from '@/lib/profile/ratingHistoryGamePoints';
import { RATING_MODE_ACCENTS, formatRating } from '@/lib/profile/ratingDashboardTheme';
import { RatingEmptyState } from '@/components/profile/ratings/RatingEmptyState';

type Props = {
  bucket: RatingBucketView;
  period: RatingPeriodFilter;
};

/**
 * Stock-ticker chart: line = rating movement; each point = one finished rated game.
 * Interactive dots/tooltips/click only when authoritative snapshots exist.
 * @see docs/profile/PROFILE_RATING_DASHBOARD_DOCTRINE.md
 */
function filterByPeriod(points: RatingGamePointSnapshot[], period: RatingPeriodFilter): RatingGamePointSnapshot[] {
  if (period === 'all') return points;
  const now = Date.now();
  const days =
    period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
  const cutoff = now - days * 86400000;
  return points.filter((p) => {
    const t = new Date(p.finishedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function RatingHistoryChart({ bucket, period }: Props) {
  const accent = RATING_MODE_ACCENTS[bucket.mode];
  const raw = bucket.history ?? [];
  const authoritative = bucketHasAuthoritativeRatingHistory(bucket);
  const points = useMemo(() => filterByPeriod(raw, period), [raw, period]);

  if (bucket.inheritsModeBucket && !bucket.isOverall) {
    return (
      <RatingEmptyState
        title="Per-time-control history not available yet"
        message={`${bucket.label} is listed for navigation. Rating history for this exact time control will appear when ACCL tracks it separately from ${bucket.mode} overall.`}
      />
    );
  }

  if (!authoritative || !hasEnoughRatingChartPoints(points)) {
    return (
      <RatingEmptyState
        message={
          bucket.currentRating != null
            ? `Current rating is ${formatRating(bucket.currentRating)}. Play more rated games in this bucket to see game-by-game movement — each point will represent one finished game.`
            : undefined
        }
      />
    );
  }

  const width = 640;
  const height = 240;
  const pad = { top: 24, right: 16, bottom: 32, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const ratings = points.map((p) => p.ratingAfter);
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);
  const yPad = Math.max(20, Math.round((maxR - minR) * 0.08) || 20);
  const yMin = minR - yPad;
  const yMax = maxR + yPad;
  const ySpan = yMax - yMin || 1;

  const toX = (i: number) => pad.left + (i / (points.length - 1)) * innerW;
  const toY = (r: number) => pad.top + innerH - ((r - yMin) / ySpan) * innerH;

  const line = points.map((p, i) => `${toX(i)},${toY(p.ratingAfter)}`).join(' ');
  const area = `${pad.left},${pad.top + innerH} ${line} ${pad.left + innerW},${pad.top + innerH}`;

  const peakIdx = ratings.indexOf(maxR);
  const lowIdx = ratings.indexOf(minR);
  const currentIdx = points.length - 1;

  const yTicks = [yMin, yMin + ySpan * 0.5, yMax];

  return (
    <div className="w-full overflow-hidden rounded-xl border border-[#243244] bg-[#0a1018]" data-testid="profile-rating-history-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${bucket.label} rating history chart`}>
        <defs>
          <linearGradient id={`rating-fill-${bucket.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent.chart} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent.chart} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="#1e2a3a"
              strokeWidth="1"
            />
            <text x={pad.left - 8} y={toY(tick) + 4} textAnchor="end" fill="#64748b" fontSize="10">
              {Math.round(tick)}
            </text>
          </g>
        ))}
        <polygon points={area} fill={`url(#rating-fill-${bucket.id})`} />
        <polyline
          fill="none"
          stroke={accent.chart}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={line}
        />
        {[
          { idx: peakIdx, label: 'Peak', color: '#4ade80' },
          { idx: lowIdx, label: 'Low', color: '#f87171' },
          { idx: currentIdx, label: 'Now', color: accent.chart },
        ].map(({ idx, label, color }) => (
          <g key={label}>
            <circle cx={toX(idx)} cy={toY(points[idx]!.ratingAfter)} r="5" fill={color} stroke="#0a1018" strokeWidth="2" />
            <text x={toX(idx)} y={toY(points[idx]!.ratingAfter) - 10} textAnchor="middle" fill={color} fontSize="10" fontWeight="600">
              {label}
            </text>
          </g>
        ))}
      </svg>
      <p className="sr-only">
        {bucket.label} rating history with {points.length} game points from {formatRating(points[0]?.ratingAfter ?? null)} to{' '}
        {formatRating(points[currentIdx]?.ratingAfter ?? null)}.
      </p>
    </div>
  );
}
