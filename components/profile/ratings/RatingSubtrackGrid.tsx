'use client';

import type { SubtrackCardModel } from '@/lib/profileRatingTracks';
import { formatTrackRating } from '@/lib/profileRatingTracks';

type Props = {
  subtracks: SubtrackCardModel[];
  selectedTrackId: string;
  onSelect: (trackId: string) => void;
};

export function RatingSubtrackGrid({ subtracks, selectedTrackId, onSelect }: Props) {
  return (
    <div data-testid="rating-subtrack-grid" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {subtracks.map((s) => (
        <button
          key={s.ratingTrackId}
          type="button"
          data-testid={s.isOverall ? 'rating-subtrack-overall' : `rating-subtrack-${s.ratingTrackId}`}
          data-selected={selectedTrackId === s.ratingTrackId ? 'true' : 'false'}
          onClick={() => onSelect(s.ratingTrackId)}
          className={`rounded-lg border px-3 py-2 text-left ${
            selectedTrackId === s.ratingTrackId
              ? 'border-sky-500/60 bg-sky-950/20'
              : 'border-[#2f3f54] bg-[#0f1723] hover:border-[#3d5168]'
          }`}
        >
          <p className="m-0 text-xs text-gray-400">{s.displayLabel}</p>
          <p className="m-0 mt-1 tabular-nums text-base font-semibold text-gray-100">
            {formatTrackRating(s.rating)}
          </p>
          {s.gamesPlayed != null ? (
            <p className="m-0 mt-1 text-[11px] text-gray-500" data-testid="rating-subtrack-games-count">
              {s.gamesPlayed === 0
                ? s.isOverall
                  ? 'No rated games yet'
                  : 'No exact-track games yet'
                : `${s.gamesPlayed} rated games`}
            </p>
          ) : null}
        </button>
      ))}
    </div>
  );
}
