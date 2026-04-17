import { expect, test } from '@playwright/test';

import {
  assertBioWordCount,
  computeOverallElo,
  countWords,
  isUserOnline,
  overallEloFromP1,
  PROFILE_BIO_WORD_ERROR_MESSAGE,
} from '@/lib/profile';
import type { PublicP1Read } from '@/lib/p1PublicRatingRead';

test.describe('lib/profile helpers', () => {
  test('computeOverallElo averages numeric buckets', () => {
    expect(
      computeOverallElo({
        bullet_elo: 1200,
        blitz_elo: 1300,
        rapid_elo: null,
        daily_elo: undefined,
        tournament_elo: 1500,
      }),
    ).toBe(1333);
  });

  test('overallEloFromP1 maps P1 rows', () => {
    const p1: PublicP1Read = {
      accl_rating: 1600,
      tournament_rating: 1600,
      tournament_unified: { rating: 1600, games_played: 1 },
      free_bullet: { rating: 1200, games_played: 0 },
      free_blitz: { rating: 1300, games_played: 0 },
      free_rapid: { rating: 1400, games_played: 0 },
      free_day: { rating: 1500, games_played: 0 },
    };
    expect(overallEloFromP1(p1)).toBe(1400);
  });

  test('isUserOnline uses 5 minute window', () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(isUserOnline(recent)).toBe(true);
    expect(isUserOnline(old)).toBe(false);
    expect(isUserOnline(null)).toBe(false);
  });

  test('assertBioWordCount enforces bounds', () => {
    const words150 = Array.from({ length: 150 }, () => 'word').join(' ');
    const words251 = Array.from({ length: 251 }, () => 'word').join(' ');
    expect(() => assertBioWordCount(words150)).not.toThrow();
    expect(() => assertBioWordCount(words251)).toThrow(PROFILE_BIO_WORD_ERROR_MESSAGE);
    expect(countWords(words150)).toBe(150);
  });
});
