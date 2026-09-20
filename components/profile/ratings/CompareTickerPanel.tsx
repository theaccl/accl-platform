'use client';

import Link from 'next/link';
import { useRef } from 'react';

import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';
import {
  compareAnchorPeriod,
  compareEventLinks,
  compareGameSelectionId,
  compareResultLabel,
  isRealGameEvent,
  periodOccupancy,
  type ComparePeriod,
  type CompareTicker,
} from '@/lib/profile/compareMode';
import {
  COMPARE_GAME_CATEGORIES,
  compareGameCategory,
  mainCompareGameCategory,
  type CompareGameCategoryId,
} from '@/lib/profile/compareGamePicker';
import type { CompareTickerPeriodLoad } from '@/lib/profile/loadCompareTickerPeriod';
import type { RatingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

type Props = {
  ticker: CompareTicker;
  period: ComparePeriod;
  loaded: CompareTickerPeriodLoad | undefined;
  games: RatingHistoryPoint[];
  mainTrackId: string;
  canLinkFinishedGames: boolean;
  nowMs: number;
  earliestMs: number | null;
  variant: 'compact' | 'expanded';
  onRemove: () => void;
  onStep: (direction: 'prev' | 'next') => void;
  onSetAnchor: (anchorMs: number) => void;
  onSelectGame: (game: RatingHistoryPoint) => void;
  onSelectCategory: (category: CompareGameCategoryId) => void;
  panelRef?: (node: HTMLElement | null) => void;
  panelId?: string;
};

type ComparePeriodSelectorProps = Pick<
  Props,
  'ticker' | 'period' | 'nowMs' | 'earliestMs' | 'onStep' | 'onSetAnchor'
> & {
  slotName: string;
};

type CompareGamePickerProps = Pick<
  Props,
  'games' | 'mainTrackId' | 'canLinkFinishedGames' | 'onSelectGame' | 'onSelectCategory'
> & {
  slotName: string;
  period: ComparePeriod;
  loading: boolean;
  selectedGameId: string | null;
  sourceTrackId: CompareGameCategoryId | null;
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

function monthInputValue(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

function eventLabel(point: RatingHistoryPoint): string {
  const family = COMPARE_GAME_CATEGORIES.find((category) => category.id === compareGameCategory(point))?.label
    ?? point.mode
    ?? point.ratingTrackId;
  const control = point.timeControl ? ` · ${point.timeControl}` : '';
  const opponent = point.opponentUsername ? ` · vs ${point.opponentUsername}` : '';
  return `${point.occurredAt.slice(0, 16).replace('T', ' ')} UTC · ${family}${control}${opponent}`;
}

export function ComparePeriodSelector({
  ticker,
  period,
  nowMs,
  earliestMs,
  slotName,
  onStep,
  onSetAnchor,
}: ComparePeriodSelectorProps) {
  const laneLabel = `${period.lane[0].toUpperCase()}${period.lane.slice(1)}`;
  const isMonth = period.lane === 'month';
  const isYear = period.lane === 'year';
  const inputType = isMonth ? 'month' : isYear ? 'number' : 'date';
  const inputLabel = isMonth
    ? `Month for ${slotName}`
    : isYear
      ? `Year for ${slotName}`
      : `UTC date for ${slotName}`;
  const inputValue = isMonth
    ? monthInputValue(ticker.anchorMs)
    : isYear
      ? String(new Date(ticker.anchorMs).getUTCFullYear())
      : utcInputValue(ticker.anchorMs);
  const inputMax = isMonth
    ? monthInputValue(nowMs)
    : isYear
      ? String(new Date(nowMs).getUTCFullYear())
      : utcInputValue(nowMs);
  const earliestPeriodStartMs = earliestMs === null
    ? null
    : compareAnchorPeriod(period.lane, earliestMs, period.timeZone)?.startMs ?? null;
  const inputMin = earliestPeriodStartMs === null
    ? (isYear ? '1900' : undefined)
    : isMonth
      ? monthInputValue(earliestPeriodStartMs)
      : isYear
        ? String(new Date(earliestPeriodStartMs).getUTCFullYear())
        : utcInputValue(earliestPeriodStartMs);

  function selectPeriod(raw: string) {
    if (!raw) return;
    const anchorMs = isMonth
      ? Date.parse(`${raw}-01T00:00:00Z`)
      : isYear
        ? Date.parse(`${raw}-01-01T00:00:00Z`)
        : Date.parse(`${raw}T00:00:00Z`);
    if (Number.isFinite(anchorMs)) onSetAnchor(anchorMs);
  }

  return (
    <>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-end gap-2">
        <button
          type="button"
          disabled={earliestPeriodStartMs !== null && period.startMs <= earliestPeriodStartMs}
          onClick={() => onStep('prev')}
          aria-label={`Previous period for ${slotName}`}
          title={`Previous ${period.lane}`}
          className="min-h-10 rounded-md border border-[#3d5168] text-base text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ←
        </button>
        <label className="min-w-0 text-xs font-medium text-gray-300">
          {isMonth ? 'Choose month' : isYear ? 'Choose year' : 'Choose date'}
          <input
            type={inputType}
            aria-label={inputLabel}
            value={inputValue}
            max={inputMax}
            min={inputMin}
            onChange={(event) => selectPeriod(event.target.value)}
            className="mt-1 block min-h-10 w-full min-w-0 rounded-md border border-[#3d5168] bg-[#0f1723] px-2 py-1.5 text-gray-100"
          />
        </label>
        <button
          type="button"
          disabled={period.endMs > nowMs}
          onClick={() => onStep('next')}
          aria-label={`Next period for ${slotName}`}
          title={`Next ${period.lane}`}
          className="min-h-10 rounded-md border border-[#3d5168] text-base text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
      </div>
      {earliestMs !== null ? (
        <p className="m-0 text-xs text-gray-400">History begins with this profile&apos;s sign-up period.</p>
      ) : null}
      <p className="m-0 text-xs text-gray-400">
        Main controls the {laneLabel} view. {isMonth
          ? 'Choose a month from this profile’s history, including prior years when available.'
          : isYear
            ? 'Choose the year to compare.'
            : `Pick a date to compare its full ${period.lane}.`}
      </p>
    </>
  );
}

export function CompareGamePicker({
  games,
  mainTrackId,
  canLinkFinishedGames,
  onSelectGame,
  onSelectCategory,
  slotName,
  period,
  loading,
  selectedGameId,
  sourceTrackId,
}: CompareGamePickerProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const counts = new Map<CompareGameCategoryId, number>();
  for (const game of games) {
    const category = compareGameCategory(game);
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const defaultCategory = mainCompareGameCategory(mainTrackId)
    ?? COMPARE_GAME_CATEGORIES.find((category) => counts.has(category.id))?.id
    ?? 'free_bullet';
  const selectedCategory = sourceTrackId ?? defaultCategory;
  const visibleGames = games.filter((game) => compareGameCategory(game) === selectedCategory);
  const selectedCategoryLabel = COMPARE_GAME_CATEGORIES.find((category) => category.id === selectedCategory)!.label;
  const selectedGame = games.find((game) => selectedGameId === compareGameSelectionId(game));
  const selectedGameMs = selectedGame ? Date.parse(selectedGame.occurredAt) : NaN;
  const selectedGameIsInPeriod = Number.isFinite(selectedGameMs)
    && selectedGame !== undefined
    && compareGameCategory(selectedGame) === selectedCategory
    && selectedGameMs >= period.startMs
    && selectedGameMs < period.endMs;
  const selectedGameCategory = selectedGame ? compareGameCategory(selectedGame) : null;
  const selectedGameCategoryLabel = COMPARE_GAME_CATEGORIES.find((category) => category.id === selectedGameCategory)?.label;

  function selectGame(game: RatingHistoryPoint) {
    if (!Number.isFinite(Date.parse(game.occurredAt))) return;
    onSelectGame(game);
    detailsRef.current?.removeAttribute('open');
  }

  return (
    <>
      <details ref={detailsRef} className="rounded-lg border border-[#2f3f54] bg-[#0b121c]">
        <summary
          className="cursor-pointer px-3 py-2 text-sm font-semibold text-sky-300"
          aria-label={`Choose from games for ${slotName}`}
        >
          Choose from games
        </summary>
        <div
          role="group"
          aria-label={`Game type for ${slotName}`}
          className="flex max-w-full flex-wrap gap-1.5 border-t border-[#2f3f54] px-3 py-2"
        >
          {COMPARE_GAME_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={sourceTrackId === category.id}
              onClick={() => {
                onSelectCategory(category.id);
              }}
              className={`min-h-9 shrink-0 rounded-md border px-2 text-xs ${sourceTrackId === category.id
                ? 'border-sky-400 bg-sky-950 text-white'
                : 'border-[#3d5168] text-gray-300'}`}
            >
              {category.label} ({counts.get(category.id) ?? 0})
            </button>
          ))}
        </div>
        <p className="m-0 px-3 pb-2 text-xs text-gray-400">
          {sourceTrackId
            ? `Choose a game to jump to its full ${period.lane} period, or use the date controls above.`
            : `Previewing ${selectedCategoryLabel} games. Select a mode to load its full history, then choose a date or game.`}
        </p>
        {visibleGames.length ? (
          <ul className="m-0 max-h-56 space-y-2 overflow-y-auto border-t border-[#2f3f54] px-3 py-2 pl-7">
            {visibleGames.map((game) => {
              const links = compareEventLinks(game);
              const selectionLabel = `${eventLabel(game)} · ${game.result} · ${game.ratingBefore} → ${game.ratingAfter} (${game.ratingDelta >= 0 ? '+' : ''}${game.ratingDelta})`;
              return (
                <li key={game.id} className="text-xs text-gray-300">
                  <button
                    type="button"
                    onClick={() => selectGame(game)}
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
        ) : <p className="m-0 border-t border-[#2f3f54] px-3 py-2 text-xs text-gray-500">No loaded {selectedCategoryLabel} games.</p>}
      </details>
      {selectedGameIsInPeriod ? (
        <p
          className="m-0 text-xs text-sky-200"
          data-testid={`compare-game-selection-${slotName.toLowerCase()}`}
          aria-live="polite"
        >
          Showing all {selectedGameCategoryLabel ?? 'selected'} games in {comparePeriodLaneWindow(period).caption}.{loading ? ' Loading verified history…' : ''}
        </p>
      ) : null}
    </>
  );
}

type ComparePeriodGamesListProps = {
  points: RatingHistoryPoint[];
  period: ComparePeriod;
  selectedGameId: string | null;
  canLinkFinishedGames: boolean;
  slotName: string;
};

/** Every verified game in the chosen family and calendar period, not only the picked game. */
export function ComparePeriodGamesList({
  points,
  period,
  selectedGameId,
  canLinkFinishedGames,
  slotName,
}: ComparePeriodGamesListProps) {
  const periodGames = points.filter((point) => {
    const occurredMs = Date.parse(point.occurredAt);
    return isRealGameEvent(point) && occurredMs >= period.startMs && occurredMs < period.endMs;
  });
  if (periodGames.length === 0) return null;
  return (
    <section className="space-y-2" data-testid={`compare-period-games-${slotName.toLowerCase()}`}>
      <h6 className="m-0 text-xs font-semibold text-gray-200">
        Games in this {period.lane} ({periodGames.length})
      </h6>
      <ul className="m-0 max-h-40 space-y-1 overflow-y-auto p-0">
          {periodGames.map((game) => {
            const selected = selectedGameId !== null && selectedGameId === compareGameSelectionId(game);
            const links = compareEventLinks(game);
            return (
              <li
                key={game.id}
                data-selected={selected ? 'true' : 'false'}
                className={`flex flex-wrap items-center gap-x-2 rounded-md border px-2 py-1.5 text-xs ${selected
                  ? 'border-sky-400/70 bg-sky-400/10 text-sky-100'
                  : 'border-[#2f3f54] text-gray-300'}`}
              >
                <span className="min-w-0 break-words">{eventLabel(game)} · {game.result} · {game.ratingBefore} → {game.ratingAfter}</span>
                {selected ? <span className="font-semibold text-sky-300">Picked</span> : null}
                {canLinkFinishedGames && links.openGameHref ? (
                  <Link className="font-semibold text-sky-300" href={links.openGameHref}>Open game</Link>
                ) : null}
              </li>
            );
          })}
      </ul>
    </section>
  );
}

export function CompareTickerPanel({
  ticker,
  period,
  loaded,
  games,
  mainTrackId,
  canLinkFinishedGames,
  nowMs,
  earliestMs,
  variant,
  onRemove,
  onStep,
  onSetAnchor,
  onSelectGame,
  onSelectCategory,
  panelRef,
  panelId,
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
      id={panelId}
      ref={panelRef}
      aria-labelledby={panelTitleId}
      className={
        variant === 'compact'
          ? 'w-[min(100%,38rem)] min-w-[min(100%,22rem)] shrink-0 snap-start space-y-3 rounded-xl border border-[#3d5168] bg-[#0f1723] p-3'
          : 'min-w-0 scroll-mt-16 space-y-3 rounded-xl border border-[#3d5168] bg-[#0f1723] p-3'
      }
      data-testid={`${variant === 'expanded' ? 'expanded-' : ''}compare-panel-${ticker.slot}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 id={panelTitleId} className="m-0 font-semibold text-white">{slotName} · rank {ticker.rank}</h5>
          <p className="m-0 text-xs text-gray-400">{comparePeriodLaneWindow(period).caption}</p>
          <p className="m-0 text-xs text-sky-300">
            {COMPARE_GAME_CATEGORIES.find((category) => category.id === ticker.sourceTrackId)?.label ?? 'Main rating track'} history
          </p>
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
      <div
        className="space-y-2 rounded-lg border border-[#2f3f54] bg-[#0b121c] p-2"
        data-testid={`compare-date-controls-${ticker.slot}`}
        data-lane={period.lane}
      >
        <ComparePeriodSelector
          ticker={ticker}
          period={period}
          nowMs={nowMs}
          earliestMs={earliestMs}
          slotName={slotName}
          onStep={onStep}
          onSetAnchor={onSetAnchor}
        />
      </div>
      <CompareGamePicker
        games={games}
        mainTrackId={mainTrackId}
        canLinkFinishedGames={canLinkFinishedGames}
        onSelectGame={onSelectGame}
        onSelectCategory={onSelectCategory}
        selectedGameId={ticker.selectedGameId ?? null}
        sourceTrackId={ticker.sourceTrackId ?? null}
        slotName={slotName}
        period={period}
        loading={!loaded}
      />
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
          highlightedGameId={ticker.selectedGameId ?? null}
        />
      ) : null}
      {loaded?.status === 'complete' && occupancy?.coverage === 'complete' ? (
        <ComparePeriodGamesList
          points={periodPoints}
          period={period}
          selectedGameId={ticker.selectedGameId ?? null}
          canLinkFinishedGames={canLinkFinishedGames}
          slotName={slotName}
        />
      ) : null}
    </article>
  );
}
