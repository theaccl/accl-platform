import { test, expect } from '@playwright/test';
import { classifyP1RatingBucket } from '../../lib/p1RatingClassifier';
import { P1_FREE_DAY_BUCKET, P1_TOURNAMENT_BUCKET } from '../../lib/p1RatingsSpec';

test.describe('P1 rating classifier (locked TC map)', () => {
  test('tournament → tournament_unified', () => {
    expect(classifyP1RatingBucket('tournament', 'live', '5m')).toBe(P1_TOURNAMENT_BUCKET);
  });

  test('bullet: 1m, 1+1, 2+1', () => {
    expect(classifyP1RatingBucket('free', 'live', '1m')).toBe('free_bullet');
    expect(classifyP1RatingBucket('free', 'live', '1+1')).toBe('free_bullet');
    expect(classifyP1RatingBucket('free', 'live', '2+1')).toBe('free_bullet');
  });

  test('blitz: 3m, 3+2, 5m, 5+5', () => {
    expect(classifyP1RatingBucket('free', 'live', '3m')).toBe('free_blitz');
    expect(classifyP1RatingBucket('free', 'live', '3+2')).toBe('free_blitz');
    expect(classifyP1RatingBucket('free', 'live', '5m')).toBe('free_blitz');
    expect(classifyP1RatingBucket('free', 'live', '5+5')).toBe('free_blitz');
  });

  test('rapid: 10–60m', () => {
    expect(classifyP1RatingBucket('free', 'live', '10m')).toBe('free_rapid');
    expect(classifyP1RatingBucket('free', 'live', '15m')).toBe('free_rapid');
    expect(classifyP1RatingBucket('free', 'live', '20m')).toBe('free_rapid');
    expect(classifyP1RatingBucket('free', 'live', '30m')).toBe('free_rapid');
    expect(classifyP1RatingBucket('free', 'live', '60m')).toBe('free_rapid');
  });

  test('daily tempo 30m/60m → rapid', () => {
    expect(classifyP1RatingBucket('free', 'daily', '30m')).toBe('free_rapid');
    expect(classifyP1RatingBucket('free', 'daily', '60m')).toBe('free_rapid');
  });

  test('calendar: 1d–3d and correspondence → free_day', () => {
    expect(classifyP1RatingBucket('free', 'live', '1d')).toBe(P1_FREE_DAY_BUCKET);
    expect(classifyP1RatingBucket('free', 'live', '2d')).toBe(P1_FREE_DAY_BUCKET);
    expect(classifyP1RatingBucket('free', 'live', '3d')).toBe(P1_FREE_DAY_BUCKET);
    expect(classifyP1RatingBucket('free', 'correspondence', '')).toBe(P1_FREE_DAY_BUCKET);
  });

  test('unspecified live TC → free_blitz', () => {
    expect(classifyP1RatingBucket('free', 'live', '')).toBe('free_blitz');
    expect(classifyP1RatingBucket('free', '', '')).toBe('free_blitz');
  });

  test('unknown TC → null', () => {
    expect(classifyP1RatingBucket('free', 'live', '2m')).toBeNull();
    expect(classifyP1RatingBucket('free', 'live', '4+4')).toBeNull();
  });
});
