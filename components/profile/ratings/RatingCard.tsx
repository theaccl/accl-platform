'use client';

import { formatTrackRating } from '@/lib/profileRatingTracks';

type Props = {
  label: string;
  rating: number | null;
  gamesPlayed: number | null;
  selected: boolean;
  hasHistory: boolean;
  testId?: string;
  onSelect: () => void;
};

export function RatingCard({
  label,
  rating,
  gamesPlayed,
  selected,
  hasHistory,
  testId,
  onSelect,
}: Props) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
      data-has-history={hasHistory ? 'true' : 'false'}
      onClick={onSelect}
      className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${
        selected
          ? 'border-sky-500/60 bg-sky-950/25'
          : 'border-[#2f3f54] bg-[#0f1723] hover:border-[#3d5168]'
      }`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <span className="tabular-nums text-lg font-semibold text-gray-100">{formatTrackRating(rating)}</span>
      {typeof gamesPlayed === 'number' ? (
        <span className="text-xs text-gray-500">{gamesPlayed} games</span>
      ) : (
        <span className="text-xs text-gray-600">Games —</span>
      )}
    </button>
  );
}
