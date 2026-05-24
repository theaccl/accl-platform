'use client';

import { useMemo, useState } from 'react';
import type { PublicP1Read } from '@/lib/p1PublicRatingRead';
import {
  buildProfileRatingViewModel,
  defaultBucketIdForMode,
  findBucketById,
} from '@/lib/profile/buildProfileRatingViewModel';
import type { RatingGameFilter, RatingMode, RatingPeriodFilter } from '@/lib/profile/ratingDashboardTypes';
import { modeLabel } from '@/lib/profile/ratingTimeControlCatalog';
import { RatingDetailPanel } from '@/components/profile/ratings/RatingDetailPanel';
import { RatingHistoryChart } from '@/components/profile/ratings/RatingHistoryChart';
import { RatingSummaryCard } from '@/components/profile/ratings/RatingSummaryCard';
import { RatingTimeControlCard } from '@/components/profile/ratings/RatingTimeControlCard';

type Props = {
  p1: PublicP1Read | null | undefined;
  currentStreak?: number;
  highestStreak?: number;
};

const PERIOD_OPTIONS: { id: RatingPeriodFilter; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'All' },
];

const GAME_FILTER_OPTIONS: { id: RatingGameFilter; label: string }[] = [
  { id: 'all', label: 'All Games' },
  { id: 'wins', label: 'Wins Only' },
  { id: 'losses', label: 'Losses Only' },
  { id: 'draws', label: 'Draws Only' },
  { id: 'free', label: 'Free Play' },
  { id: 'tournament', label: 'Tournament' },
];

export function ProfileRatingDashboard({ p1, currentStreak = 0, highestStreak = 0 }: Props) {
  const model = useMemo(
    () => buildProfileRatingViewModel(p1, { currentStreak, highestStreak }),
    [p1, currentStreak, highestStreak],
  );

  const [selectedMode, setSelectedMode] = useState<RatingMode>('blitz');
  const [selectedBucketId, setSelectedBucketId] = useState(() => defaultBucketIdForMode('blitz', model));
  const [period, setPeriod] = useState<RatingPeriodFilter>('all');
  const [gameFilter, setGameFilter] = useState<RatingGameFilter>('all');

  const selectedBucket = findBucketById(model, selectedBucketId) ?? model.topCards[0]!;
  const timeControls = model.bucketsByMode[selectedMode] ?? [];
  const childTimeControls = timeControls.filter((b) => !b.isOverall);

  const selectMode = (mode: RatingMode) => {
    setSelectedMode(mode);
    setSelectedBucketId(defaultBucketIdForMode(mode, model));
  };

  const overviewTitle =
    selectedMode === 'accl'
      ? 'ACCL Overview'
      : `${modeLabel(selectedMode)} Overview`;

  return (
    <section className="space-y-4" aria-labelledby="profile-ratings-heading" data-testid="profile-rating-dashboard">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="profile-ratings-heading" className="text-base font-semibold text-white">
            Rating Dashboard
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Click a rating to explore movement, streaks, and time-control drilldowns.
          </p>
        </div>
        <p className="text-xs text-gray-600">History charts fill in as rated games accumulate — no synthetic data.</p>
      </div>

      <div
        className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Rating categories"
      >
        {model.topCards.map((card) => (
          <RatingSummaryCard
            key={card.id}
            bucket={card}
            selected={selectedMode === card.mode}
            onSelect={() => selectMode(card.mode)}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-[#243244] bg-[#0f1723] p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              {selectedBucket.mode === 'accl' ? 'Identity' : modeLabel(selectedMode)}
            </p>
            <h3 className="mt-1 text-xl font-bold text-white" data-testid="profile-rating-detail-title">
              {selectedBucket.label}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={period === opt.id}
                onClick={() => setPeriod(opt.id)}
                className={[
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
                  period === opt.id
                    ? 'border-sky-500/50 bg-sky-950/40 text-sky-100'
                    : 'border-[#2a384a] text-gray-400 hover:border-[#3d5168]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {GAME_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={gameFilter === opt.id}
              disabled={opt.id !== 'all'}
              title={opt.id !== 'all' ? 'Filter wiring pending rating history data' : undefined}
              onClick={() => setGameFilter(opt.id)}
              className={[
                'rounded-md border px-2.5 py-1 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
                gameFilter === opt.id
                  ? 'border-[#3d5168] bg-[#141c28] text-gray-200'
                  : 'border-[#243244] text-gray-500',
                opt.id !== 'all' ? 'cursor-not-allowed opacity-50' : 'hover:border-[#3d5168]',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <RatingHistoryChart bucket={selectedBucket} period={period} />
          <RatingDetailPanel
            bucket={selectedBucket}
            overviewTitle={overviewTitle}
            timeControls={timeControls}
            selectedId={selectedBucketId}
            onSelectTimeControl={setSelectedBucketId}
          />
        </div>
      </div>

      {childTimeControls.length > 0 ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-300">
            {modeLabel(selectedMode)} time controls
          </h4>
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {childTimeControls.map((tc) => (
              <RatingTimeControlCard
                key={tc.id}
                bucket={tc}
                selected={selectedBucketId === tc.id}
                onSelect={() => setSelectedBucketId(tc.id)}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Specific time-control charts use separate history once ACCL records per-control rating movement.
          </p>
        </div>
      ) : null}
    </section>
  );
}
