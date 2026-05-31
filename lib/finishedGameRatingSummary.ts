/**
 * Player-facing finished-game rating summary (read-only; no settlement authority).
 */

import { parseBadgeBlockFromRatingUpdate } from '@/lib/badgeSettlementRead';
import { gameDisplayTempoLabel } from '@/lib/gameDisplayLabel';
import { gameRatedListLabel } from '@/lib/gameRated';

export type RatingSideSnapshot = {
  before: number;
  after: number;
  delta: number;
};

export type FinishedRatingSideLine = {
  label: 'White' | 'Black';
  before: number;
  after: number;
  delta: number;
};

export type FinishedGameRatingSummary = {
  modeLine: string;
  white: FinishedRatingSideLine | null;
  black: FinishedRatingSideLine | null;
  note: string | null;
};

function parseSide(raw: unknown): RatingSideSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const before = o.before;
  const after = o.after;
  const delta = o.delta;
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  return {
    before,
    after,
    delta: typeof delta === 'number' ? delta : after - before,
  };
}

function sideFromRatingUpdate(
  ratingLastUpdate: unknown,
  side: 'white' | 'black',
): RatingSideSnapshot | null {
  if (!ratingLastUpdate || typeof ratingLastUpdate !== 'object') return null;
  const o = ratingLastUpdate as Record<string, unknown>;
  const direct =
    side === 'white'
      ? parseSide(o.p1_white) ?? parseSide(o.white)
      : parseSide(o.p1_black) ?? parseSide(o.black);
  if (direct) return direct;

  const badge = parseBadgeBlockFromRatingUpdate(ratingLastUpdate);
  const ticker = side === 'white' ? badge?.white : badge?.black;
  if (
    ticker &&
    typeof ticker.rating_before === 'number' &&
    typeof ticker.rating_after === 'number'
  ) {
    return {
      before: ticker.rating_before,
      after: ticker.rating_after,
      delta:
        typeof ticker.rating_delta === 'number'
          ? ticker.rating_delta
          : ticker.rating_after - ticker.rating_before,
    };
  }
  return null;
}

export function formatRatingDelta(delta: number): string {
  if (delta > 0) return `(+${delta})`;
  if (delta < 0) return `(${delta})`;
  return '(±0)';
}

export function formatRatingSideLine(line: FinishedRatingSideLine): string {
  return `${line.before} → ${line.after}  ${formatRatingDelta(line.delta)}`;
}

export function buildFinishedGameRatingSummary(input: {
  ratingLastUpdate: unknown;
  rated: boolean | null | undefined;
  tempo: string | null | undefined;
  liveTimeControl: string | null | undefined;
  ratingApplied?: boolean | null | undefined;
}): FinishedGameRatingSummary {
  const tempoLabel = gameDisplayTempoLabel({
    tempo: input.tempo,
    liveTimeControl: input.liveTimeControl,
  });
  const modeLine = `${tempoLabel} · ${gameRatedListLabel(input.rated)}`;

  if (input.rated !== true) {
    return {
      modeLine,
      white: null,
      black: null,
      note: 'Unrated — no rating change for this game.',
    };
  }

  if (input.ratingApplied === false) {
    return {
      modeLine,
      white: null,
      black: null,
      note: 'Rated game — rating was not applied to player records.',
    };
  }

  const whiteSnap = sideFromRatingUpdate(input.ratingLastUpdate, 'white');
  const blackSnap = sideFromRatingUpdate(input.ratingLastUpdate, 'black');

  if (!whiteSnap && !blackSnap) {
    return {
      modeLine,
      white: null,
      black: null,
      note: 'Rating summary is not available yet. Try refreshing in a moment.',
    };
  }

  return {
    modeLine,
    white: whiteSnap
      ? { label: 'White', before: whiteSnap.before, after: whiteSnap.after, delta: whiteSnap.delta }
      : null,
    black: blackSnap
      ? { label: 'Black', before: blackSnap.before, after: blackSnap.after, delta: blackSnap.delta }
      : null,
    note: null,
  };
}
