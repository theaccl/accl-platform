import type { RatingBucketView } from '@/lib/profile/ratingDashboardTypes';
import { RATING_MODE_ACCENTS, formatDelta, formatRating } from '@/lib/profile/ratingDashboardTheme';
import { RatingMiniSparkline } from '@/components/profile/ratings/RatingMiniSparkline';

type Props = {
  bucket: RatingBucketView;
  selected: boolean;
  onSelect: () => void;
};

export function RatingTimeControlCard({ bucket, selected, onSelect }: Props) {
  const accent = RATING_MODE_ACCENTS[bucket.mode];
  const delta = formatDelta(bucket.delta);

  return (
    <button
      type="button"
      data-testid={`profile-rating-tc-${bucket.id}`}
      aria-pressed={selected}
      aria-label={`${bucket.label}, rating ${formatRating(bucket.currentRating)}`}
      onClick={onSelect}
      className={[
        'flex min-w-[120px] flex-1 flex-col gap-2 rounded-xl border bg-[#0c121c] p-3 text-left transition',
        'hover:border-[#3d5168] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
        selected ? `${accent.border} shadow-md ${accent.glow}` : 'border-[#2a384a]',
      ].join(' ')}
    >
      <span className="text-sm font-semibold text-gray-100">{bucket.label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums text-white">{formatRating(bucket.currentRating)}</span>
        {delta ? (
          <span className={delta.startsWith('+') ? 'text-xs text-emerald-400' : 'text-xs text-red-400'}>{delta}</span>
        ) : null}
      </div>
      <RatingMiniSparkline points={bucket.sparkline ?? bucket.history} color={accent.chart} height={24} />
      <div className="flex gap-3 text-[10px] text-gray-500">
        <span>Peak {formatRating(bucket.peak)}</span>
        <span>Low {formatRating(bucket.lowest)}</span>
        <span>{bucket.gamesPlayed != null ? `${bucket.gamesPlayed} g` : '— g'}</span>
      </div>
    </button>
  );
}
