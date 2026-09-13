'use client';

import Link from 'next/link';

import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';
import {
  compareEventLinks,
  periodOccupancy,
  type ComparePeriod,
  type CompareTicker,
} from '@/lib/profile/compareMode';
import type { CompareTickerPeriodLoad } from '@/lib/profile/loadCompareTickerPeriod';
import type { RatingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

type Props = {
  ticker: CompareTicker;
  period: ComparePeriod;
  loaded: CompareTickerPeriodLoad | undefined;
  games: RatingHistoryPoint[];
  canLinkFinishedGames: boolean;
  nowMs: number;
  variant: 'compact' | 'expanded';
  onRemove: () => void;
  onStep: (direction: 'prev' | 'next') => void;
  onSetAnchor: (anchorMs: number) => void;
  panelRef?: (node: HTMLElement | null) => void;
};

export function comparePeriodLaneWindow(period: ComparePeriod): RatingLaneWindow {
  const startDate = new Date(period.startMs);
  const endDate = new Date(period.endMs - 1);
  const month = (date: Date) => date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  let caption: string;
  if (period.lane === 'day') {
    caption = `${month(startDate)} ${startDate.getUTCDate()}, ${startDate.getUTCFullYear()} · UTC`;
  } else if (period.lane === 'week' && period.isoWeek) {
    caption = `${period.isoWeek.isoWeekYear} · ISO W${String(period.isoWeek.isoWeek).padStart(2, '0')} · ${month(startDate)} ${startDate.getUTCDate()}–${month(endDate)} ${endDate.getUTCDate()} · UTC`;
  } else if (period.lane === 'month') {
    caption = `${month(startDate)} ${startDate.getUTCFullYear()} · UTC`;
  } else {
    caption = `${startDate.getUTCFullYear()} · Jan–Dec · UTC`;
  }
  return {
    lane: period.lane,
    timeZone: period.timeZone,
    startMs: period.startMs,
    endMs: period.endMs,
    caption,
    isoWeek: period.isoWeek,
  };
}

function utcInputValue(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function eventLabel(point: RatingHistoryPoint): string {
  const family = point.mode ?? point.ratingTrackId;
  const control = point.timeControl ? ` · ${point.timeControl}` : '';
  const opponent = point.opponentUsername ? ` · vs ${point.opponentUsername}` : '';
  return `${point.occurredAt.slice(0, 16).replace('T', ' ')} UTC · ${family}${control}${opponent}`;
}

function compareResultLabel(point: RatingHistoryPoint): string {
  return point.eventType === 'manual_admin_adjustment' ? 'Rating adjustment' : point.result;
}

export function CompareTickerPanel({
  ticker,
  period,
  loaded,
  games,
  canLinkFinishedGames,
  nowMs,
  variant,
  onRemove,
  onStep,
  onSetAnchor,
  panelRef,
}: Props) {
  const occupancy = loaded ? periodOccupancy(loaded.points, period, loaded.coverage) : null;
  const periodPoints = loaded?.points.filter((point) => {
    const time = Date.parse(point.occurredAt);
    return time >= period.startMs && time < period.endMs;
  }) ?? [];
  const periodCurrentRating =
    periodPoints[periodPoints.length - 1]?.ratingAfter ?? occupancy?.carryInRating ?? null;
  const slotName = ticker.slot.toUpperCase();
  const panelTitleId = `${variant}-compare-panel-title-${ticker.slot}`;

  return (
    <article
      ref={panelRef}
      aria-labelledby={panelTitleId}
      className={
        variant === 'compact'
          ? 'w-[min(100%,38rem)] min-w-[min(100%,22rem)] shrink-0 snap-start space-y-3 rounded-xl border border-[#3d5168] bg-[#0f1723] p-3'
          : 'min-w-0 space-y-3 rounded-xl border border-[#3d5168] bg-[#0f1723] p-3'
      }
      data-testid={`${variant === 'expanded' ? 'expanded-' : ''}compare-panel-${ticker.slot}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 id={panelTitleId} className="m-0 font-semibold text-white">{slotName} · rank {ticker.rank}</h5>
          <p className="m-0 text-xs text-gray-400">{comparePeriodLaneWindow(period).caption}</p>
          <p className="m-0 text-xs text-gray-300" data-testid={`compare-summary-${ticker.slot}`}>
            {loaded?.status === 'complete' && occupancy
              ? `${occupancy.games} games · ${occupancy.ratingEvents} rating events${occupancy.netRatingChange == null ? '' : ` · ${occupancy.netRatingChange >= 0 ? '+' : ''}${occupancy.netRatingChange}`}`
              : 'Coverage incomplete — totals withheld'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {variant === 'expanded' ? (
            <span
              aria-hidden="true"
              className="inline-block min-h-9 min-w-9"
              data-testid={`expanded-progression-slot-${ticker.slot}`}
            />
          ) : null}
          <button type="button" onClick={onRemove} aria-label={`Remove ${slotName}`}>Remove</button>
        </div>
      </header>
      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          onClick={() => onStep('prev')}
          aria-label={`Previous period for ${slotName}`}
        >
          Previous period
        </button>
        <label className="text-xs text-gray-300">
          UTC date
          <input
            type="date"
            aria-label={`UTC date for ${slotName}`}
            value={utcInputValue(ticker.anchorMs)}
            max={utcInputValue(nowMs)}
            onChange={(event) => onSetAnchor(Date.parse(`${event.target.value}T00:00:00Z`))}
            className="ml-2 rounded border border-[#3d5168] bg-[#0b121c] p-2"
          />
        </label>
        <button
          type="button"
          disabled={period.endMs > nowMs}
          onClick={() => onStep('next')}
          aria-label={`Next period for ${slotName}`}
        >
          Next period
        </button>
      </div>
      <details>
        <summary
          className="cursor-pointer text-sm font-semibold text-sky-300"
          aria-label={`Choose from games for ${slotName}`}
        >
          Choose from games
        </summary>
        {games.length ? (
          <ul className="max-h-56 space-y-2 overflow-y-auto pl-5">
            {games.map((game) => {
              const links = compareEventLinks(game);
              const selectionLabel = `${eventLabel(game)} · ${game.result} · ${game.ratingBefore} → ${game.ratingAfter} (${game.ratingDelta >= 0 ? '+' : ''}${game.ratingDelta})`;
              return (
                <li key={game.id} className="text-xs text-gray-300">
                  <button
                    type="button"
                    onClick={() => onSetAnchor(Date.parse(game.occurredAt))}
                    aria-label={`Use ${selectionLabel} for ${slotName}`}
                  >
                    {selectionLabel}
                  </button>
                  {canLinkFinishedGames && links.openGameHref ? (
                    <span className="ml-2 inline-flex gap-2">
                      <Link href={links.openGameHref}>Open game</Link>
                      <Link href={links.trainerReviewHref!}>Trainer review</Link>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-xs text-gray-500">No loaded finished games.</p>}
      </details>
      {!loaded ? <p className="text-xs text-gray-400">Loading verified history…</p> : null}
      {loaded?.message ? <p className="text-xs text-amber-300">{loaded.message}</p> : null}
      {loaded ? (
        <RatingTickerChart
          points={periodPoints}
          currentRating={periodCurrentRating}
          canLinkFinishedGames={canLinkFinishedGames}
          lane={period.lane}
          window={comparePeriodLaneWindow(period)}
          carryInRating={occupancy?.coverage === 'complete' ? occupancy.carryInRating : null}
          formatEventResult={compareResultLabel}
        />
      ) : null}
    </article>
  );
}
