/**
 * Single source for: rating eligibility, target bucket, and when updates may run.
 *
 * Bucket resolution uses `classifyRatingBucket` (TS) / SQL `classify_rating_bucket` — must match exactly.
 */

import { classifyRatingBucket } from '@/lib/ratingBucketClassify';
import type { PlayContext, RatingBucket, RatingPace } from '@/lib/ratingBuckets';
import { ratingBucketDebugLabel, speedClassFromRatingBucket } from '@/lib/ratingBuckets';

export type RatingUpdateTiming = 'immediate' | 'deferred_bracket' | 'none';

export type RatingClassification = {
  bucket: RatingBucket | null;
  updateTiming: RatingUpdateTiming;
  whiteEligible: boolean;
  blackEligible: boolean;
  skipReason: string | null;
  playContext: PlayContext;
  /** Pace axis for finished-game analytics / UI (derived from bucket when present). */
  speedClass: RatingPace | null;
};

export type GameRowRatingInput = {
  status: string;
  white_player_id: string;
  black_player_id?: string | null;
  tempo?: string | null;
  live_time_control?: string | null;
  play_context?: string | null;
  rated?: boolean | null;
};

function playContextFromRow(raw: string | null | undefined): PlayContext {
  return String(raw ?? '').trim().toLowerCase() === 'tournament' ? 'tournament' : 'free';
}

/**
 * Classify a game row for rating. Safe to call on active games (returns none / ineligible).
 */
export function classifyGameForRating(g: GameRowRatingInput): RatingClassification {
  const status = String(g.status ?? '').trim().toLowerCase();
  const playContext = playContextFromRow(g.play_context);

  const whiteId = String(g.white_player_id ?? '').trim();
  const blackId = String(g.black_player_id ?? '').trim();
  const bothSeated = whiteId.length > 0 && blackId.length > 0 && whiteId !== blackId;

  const bucket = classifyRatingBucket(
    playContext,
    g.tempo,
    g.live_time_control
  );
  const speedClass = speedClassFromRatingBucket(bucket);

  if (status !== 'finished') {
    return {
      bucket,
      updateTiming: 'none',
      whiteEligible: false,
      blackEligible: false,
      skipReason: 'not_finished',
      playContext,
      speedClass,
    };
  }

  if (!bothSeated) {
    return {
      bucket,
      updateTiming: 'none',
      whiteEligible: false,
      blackEligible: false,
      skipReason: 'not_both_seated',
      playContext,
      speedClass,
    };
  }

  if (g.rated !== true) {
    return {
      bucket,
      updateTiming: 'none',
      whiteEligible: false,
      blackEligible: false,
      skipReason: 'unrated',
      playContext,
      speedClass,
    };
  }

  if (bucket === null) {
    return {
      bucket: null,
      updateTiming: 'none',
      whiteEligible: false,
      blackEligible: false,
      skipReason: 'invalid_time_control',
      playContext,
      speedClass: null,
    };
  }

  if (playContext === 'tournament') {
    return {
      bucket,
      updateTiming: 'deferred_bracket',
      whiteEligible: true,
      blackEligible: true,
      skipReason: null,
      playContext,
      speedClass,
    };
  }

  return {
    bucket,
    updateTiming: 'immediate',
    whiteEligible: true,
    blackEligible: true,
    skipReason: null,
    playContext,
    speedClass,
  };
}

export function shouldApplyImmediateFreePlayRating(c: RatingClassification): boolean {
  return c.updateTiming === 'immediate' && c.whiteEligible && c.blackEligible && c.bucket != null;
}

export function shouldDeferToBracketRating(c: RatingClassification): boolean {
  return c.updateTiming === 'deferred_bracket' && c.whiteEligible && c.blackEligible && c.bucket != null;
}

export function ratingClassificationSummaryLine(c: RatingClassification): string {
  if (c.skipReason === 'not_finished') {
    return 'Rating: not applicable until game is finished.';
  }
  if (c.skipReason === 'invalid_time_control') {
    return 'Rating: invalid time control — no rating update · players not eligible · invalid_time_control';
  }
  const bucketLabel = c.bucket ? ratingBucketDebugLabel(c.bucket) : '—';
  const timing =
    c.updateTiming === 'immediate'
      ? 'immediate (when rating engine applies)'
      : c.updateTiming === 'deferred_bracket'
        ? 'deferred to tournament bracket milestone'
        : 'no rating update';
  const elig =
    c.whiteEligible && c.blackEligible ? 'players eligible' : 'players not eligible';
  return `Rating: ${bucketLabel} · ${timing} · ${elig}${c.skipReason ? ` · ${c.skipReason}` : ''}`;
}
