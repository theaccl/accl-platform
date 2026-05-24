import type { RatingBucketView } from '@/lib/profile/ratingDashboardTypes';
import { formatDelta, formatRating, formatWinRate } from '@/lib/profile/ratingDashboardTheme';

type Props = {
  title: string;
  buckets: RatingBucketView[];
  selectedId: string;
  onSelect: (id: string) => void;
};

function stat(label: string, value: string) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#1e2a3a] py-2 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium tabular-nums text-gray-100">{value}</span>
    </div>
  );
}

export function RatingDetailPanel({
  bucket,
  overviewTitle,
  timeControls,
  selectedId,
  onSelectTimeControl,
}: {
  bucket: RatingBucketView;
  overviewTitle: string;
  timeControls: RatingBucketView[];
  selectedId: string;
  onSelectTimeControl: (id: string) => void;
}) {
  const delta = formatDelta(bucket.delta);

  return (
    <aside
      className="rounded-xl border border-[#243244] bg-[#0c121c] p-4"
      aria-label={`${bucket.label} summary`}
    >
      <h3 className="mt-0 text-sm font-semibold uppercase tracking-wide text-gray-300">{overviewTitle}</h3>
      <div className="mt-3 space-y-0">
        {stat('Current', formatRating(bucket.currentRating))}
        {stat('Change (period)', delta ?? 'Not enough data')}
        {stat('Peak', formatRating(bucket.peak))}
        {stat('Lowest', formatRating(bucket.lowest))}
        {stat('Last 10 games', bucket.last10Change != null ? formatDelta(bucket.last10Change) ?? '—' : 'Not enough data')}
        {stat('Last 30 days', bucket.last30DaysChange != null ? formatDelta(bucket.last30DaysChange) ?? '—' : 'Not enough data')}
        {stat('Best streak', bucket.bestStreak ?? 'Not enough data')}
        {stat('Current streak', bucket.currentStreak ?? 'Not enough data')}
        {stat('Games played', bucket.gamesPlayed != null ? String(bucket.gamesPlayed) : '—')}
        {stat('Wins', bucket.wins != null ? String(bucket.wins) : '—')}
        {stat('Losses', bucket.losses != null ? String(bucket.losses) : '—')}
        {stat('Draws', bucket.draws != null ? String(bucket.draws) : '—')}
        {stat('Win rate', formatWinRate(bucket.wins ?? null, bucket.gamesPlayed ?? null))}
        {stat('Avg opponent', formatRating(bucket.averageOpponent))}
      </div>

      {timeControls.length > 1 ? (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Time controls</p>
          <ul className="m-0 list-none space-y-1 p-0">
            {timeControls.map((tc) => {
              const active = tc.id === selectedId;
              const tcDelta = formatDelta(tc.delta);
              return (
                <li key={tc.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectTimeControl(tc.id)}
                    className={[
                      'flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
                      active ? 'bg-sky-950/40 text-white' : 'text-gray-300 hover:bg-[#141c28]',
                    ].join(' ')}
                  >
                    <span>{tc.label}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      <span>{formatRating(tc.currentRating)}</span>
                      {tcDelta ? (
                        <span className={tcDelta.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}>{tcDelta}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
