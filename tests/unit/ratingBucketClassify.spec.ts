import { test, expect } from '@playwright/test';

import { classifyRatingBucket } from '../../lib/ratingBucketClassify';

type Case = {
  playContext: string;
  tempo: string | null;
  liveTimeControl: string | null;
  expected: string | null;
};

const PARITY_CASES: Case[] = [
  { playContext: 'free', tempo: 'live', liveTimeControl: '5+5', expected: 'free_live' },
  { playContext: 'free', tempo: 'live', liveTimeControl: '20m', expected: 'free_live' },
  { playContext: 'free', tempo: 'live', liveTimeControl: '5m+3s', expected: 'free_live' },
  { playContext: 'free', tempo: 'live', liveTimeControl: '1+1', expected: 'free_live' },
  { playContext: 'free', tempo: 'daily', liveTimeControl: '1d', expected: 'free_daily' },
  { playContext: 'free', tempo: 'daily', liveTimeControl: '2d', expected: 'free_daily' },
  { playContext: 'free', tempo: 'daily', liveTimeControl: '3d', expected: 'free_daily' },
  { playContext: 'free', tempo: 'daily', liveTimeControl: '5d', expected: 'free_daily' },
  { playContext: 'free', tempo: 'daily', liveTimeControl: '7d', expected: 'free_daily' },
  { playContext: 'tournament', tempo: 'daily', liveTimeControl: '1d', expected: 'tournament_daily' },
  { playContext: 'free', tempo: 'correspondence', liveTimeControl: '1d', expected: 'free_correspondence' },
  { playContext: 'free', tempo: 'live', liveTimeControl: '1d', expected: 'free_correspondence' },
  { playContext: 'free', tempo: 'live', liveTimeControl: '7d', expected: 'free_daily' },
  { playContext: 'free', tempo: 'daily', liveTimeControl: '', expected: 'free_daily' },
  { playContext: 'free', tempo: 'live', liveTimeControl: '', expected: 'free_live' },
  { playContext: 'free', tempo: 'live', liveTimeControl: ' 5 + 5 ', expected: 'free_live' },
];

test.describe('ratingBucketClassify (TS parity with 20260619171000 SQL)', () => {
  for (const { playContext, tempo, liveTimeControl, expected } of PARITY_CASES) {
    test(`${playContext}/${tempo ?? 'null'}/${liveTimeControl ?? 'null'} → ${expected ?? 'null'}`, () => {
      expect(classifyRatingBucket(playContext, tempo, liveTimeControl)).toBe(expected);
    });
  }

  test('unknown live token returns null', () => {
    expect(classifyRatingBucket('free', 'live', '99m')).toBeNull();
  });

  test('daily tempo with unknown lc returns null', () => {
    expect(classifyRatingBucket('free', 'daily', '99d')).toBeNull();
  });
});
