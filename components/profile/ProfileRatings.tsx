import type { PublicP1Read } from '@/lib/p1PublicRatingRead';
import { formatRatingDisplay } from '@/lib/p1PublicRatingRead';
import { overallEloFromP1 } from '@/lib/profile';

function cell(label: string, value: string, testId?: string) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-[#2f3f54] bg-[#0f1723] px-3 py-2"
      data-testid={testId}
    >
      <span className="text-sm font-semibold text-gray-100">{label}</span>
      <span className="tabular-nums text-sm text-gray-200">{value}</span>
    </div>
  );
}

type Props = {
  p1: PublicP1Read | null | undefined;
};

export function ProfileRatings({ p1 }: Props) {
  const overall = overallEloFromP1(p1 ?? null);

  return (
    <section className="space-y-3" aria-labelledby="profile-ratings-heading">
      <h2 id="profile-ratings-heading" className="text-sm font-semibold text-white">
        Ratings
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {cell('Bullet', formatRatingDisplay(p1?.free_bullet?.rating ?? null), 'profile-elo-bullet')}
        {cell('Blitz', formatRatingDisplay(p1?.free_blitz?.rating ?? null))}
        {cell('Rapid', formatRatingDisplay(p1?.free_rapid?.rating ?? null))}
        {cell('Daily', formatRatingDisplay(p1?.free_day?.rating ?? null))}
        {cell(
          'Tournament',
          formatRatingDisplay(p1?.tournament_unified?.rating ?? p1?.tournament_rating ?? null),
          'profile-elo-tournament',
        )}
        {cell('Overall', formatRatingDisplay(overall), 'profile-overall-elo')}
      </div>
    </section>
  );
}
