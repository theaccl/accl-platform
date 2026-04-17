import { test, expect } from '@playwright/test';

import { classifyRatingBucket } from '../../lib/ratingBucketClassify';
import { classifyP1RatingBucket } from '../../lib/p1RatingClassifier';
import { P1_FREE_DAY_BUCKET, P1_TOURNAMENT_BUCKET } from '../../lib/p1RatingsSpec';

/**
 * AC: legacy SQL classify_rating_bucket + P1 classify_p1_rating_bucket target the same game rows
 * the dual-write function updates (correspondence + tournament cases).
 */
test.describe('P1 dual-write classification contract', () => {
  test('free correspondence → legacy free_correspondence + P1 free_day', () => {
    const legacy = classifyRatingBucket('free', 'correspondence', null);
    const p1 = classifyP1RatingBucket('free', 'correspondence', null);
    expect(legacy).toBe('free_correspondence');
    expect(p1).toBe(P1_FREE_DAY_BUCKET);
  });

  test('tournament correspondence → legacy tournament_correspondence + P1 tournament_unified', () => {
    const legacy = classifyRatingBucket('tournament', 'correspondence', null);
    const p1 = classifyP1RatingBucket('tournament', 'correspondence', null);
    expect(legacy).toBe('tournament_correspondence');
    expect(p1).toBe(P1_TOURNAMENT_BUCKET);
  });

  test('free live 5m → legacy free_live + P1 free_blitz', () => {
    expect(classifyRatingBucket('free', 'live', '5m')).toBe('free_live');
    expect(classifyP1RatingBucket('free', 'live', '5m')).toBe('free_blitz');
  });

  test('tournament live 5m → legacy tournament_live + P1 tournament_unified', () => {
    expect(classifyRatingBucket('tournament', 'live', '5m')).toBe('tournament_live');
    expect(classifyP1RatingBucket('tournament', 'live', '5m')).toBe(P1_TOURNAMENT_BUCKET);
  });
});
