import type { RatingBucketView } from '@/lib/profile/ratingDashboardTypes';
import {
  RATING_MODE_ACCENTS,
  formatDelta,
  formatRating,
} from '@/lib/profile/ratingDashboardTheme';
import { modeLabel } from '@/lib/profile/ratingTimeControlCatalog';
import { RatingMiniSparkline } from '@/components/profile/ratings/RatingMiniSparkline';

type Props = {
  bucket: RatingBucketView;
  selected: boolean;
  onSelect: () => void;
};

export function RatingSummaryCard({ bucket, selected, onSelect }: Props) {
  const accent = RATING_MODE_ACCENTS[bucket.mode];
  const title =
    bucket.mode === 'accl' || bucket.isOverall
      ? modeLabel(bucket.mode)
      : bucket.label;
  const delta = formatDelta(bucket.delta);

  return (
    <button
      type="button"
      data-testid={`profile-rating-card-${bucket.mode}`}
      aria-pressed={selected}
      aria-label={`${title}, rating ${formatRating(bucket.currentRating)}`}
      onClick={onSelect}
      className={[
        'flex min-w-[140px] flex-1 flex-col gap-2 rounded-xl border bg-[#0c121c] p-3 text-left transition',
        'hover:border-[#3d5168] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
        selected ? `${accent.border} shadow-lg ${accent.glow}` : 'border-[#2a384a]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${accent.icon}`}>
          {title}
        </span>
        {delta ? (
          <span
            className={[
              'text-xs font-semibold tabular-nums',
              delta.startsWith('+') ? 'text-emerald-400' : 'text-red-400',
            ].join(' ')}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <p className="m-0 text-2xl font-bold tabular-nums text-white">{formatRating(bucket.currentRating)}</p>
      <RatingMiniSparkline points={bucket.sparkline ?? bucket.history} color={accent.chart} />
    </button>
  );
}
