import { test, expect } from '@playwright/test';

import { bucketForPlayContextAndPace } from '../../lib/ratingBuckets';
import {
  classifyGameForRating,
  shouldApplyImmediateFreePlayRating,
  shouldDeferToBracketRating,
} from '../../lib/ratingClassification';

const baseFinished = {
  status: 'finished',
  white_player_id: 'w1',
  black_player_id: 'b1',
  rated: true as const,
};

test.describe('ratingClassification', () => {
  test('free live rated finished (default empty TC) → immediate, free_live', () => {
    const c = classifyGameForRating({
      ...baseFinished,
      play_context: 'free',
      tempo: 'live',
    });
    expect(c.bucket).toBe('free_live');
    expect(c.updateTiming).toBe('immediate');
    expect(c.whiteEligible).toBe(true);
    expect(shouldApplyImmediateFreePlayRating(c)).toBe(true);
    expect(shouldDeferToBracketRating(c)).toBe(false);
  });

  test('free live unrated → no update', () => {
    const c = classifyGameForRating({
      ...baseFinished,
      play_context: 'free',
      tempo: 'live',
      rated: false,
    });
    expect(c.bucket).toBe('free_live');
    expect(c.updateTiming).toBe('none');
    expect(c.skipReason).toBe('unrated');
    expect(c.whiteEligible).toBe(false);
    expect(shouldApplyImmediateFreePlayRating(c)).toBe(false);
  });

  test('free daily rated (default empty TC) → free_daily', () => {
    const c = classifyGameForRating({ ...baseFinished, tempo: 'daily' });
    expect(c.bucket).toBe('free_daily');
    expect(c.updateTiming).toBe('immediate');
  });

  test('free correspondence rated (default empty TC) → free_correspondence', () => {
    const c = classifyGameForRating({ ...baseFinished, tempo: 'correspondence' });
    expect(c.bucket).toBe('free_correspondence');
    expect(c.updateTiming).toBe('immediate');
  });

  test('free live 5+5 rated → free_live (SQL parity)', () => {
    const c = classifyGameForRating({
      ...baseFinished,
      play_context: 'free',
      tempo: 'live',
      live_time_control: '5+5',
    });
    expect(c.bucket).toBe('free_live');
    expect(c.updateTiming).toBe('immediate');
    expect(shouldApplyImmediateFreePlayRating(c)).toBe(true);
  });

  test('free daily 1d rated → free_daily (SQL parity)', () => {
    const c = classifyGameForRating({
      ...baseFinished,
      play_context: 'free',
      tempo: 'daily',
      live_time_control: '1d',
    });
    expect(c.bucket).toBe('free_daily');
    expect(c.updateTiming).toBe('immediate');
    expect(shouldApplyImmediateFreePlayRating(c)).toBe(true);
  });

  test('free live 5m+3s rated → free_live (official legacy token)', () => {
    const c = classifyGameForRating({
      ...baseFinished,
      play_context: 'free',
      tempo: 'live',
      live_time_control: '5m+3s',
    });
    expect(c.bucket).toBe('free_live');
    expect(c.updateTiming).toBe('immediate');
    expect(shouldApplyImmediateFreePlayRating(c)).toBe(true);
  });

  test('finished rated unknown time control → invalid_time_control', () => {
    const c = classifyGameForRating({
      ...baseFinished,
      play_context: 'free',
      tempo: 'live',
      live_time_control: '99m',
    });
    expect(c.bucket).toBeNull();
    expect(c.skipReason).toBe('invalid_time_control');
    expect(c.updateTiming).toBe('none');
    expect(shouldApplyImmediateFreePlayRating(c)).toBe(false);
  });

  test('tournament live rated → tournament_live, deferred_bracket', () => {
    const c = classifyGameForRating({
      ...baseFinished,
      play_context: 'tournament',
      tempo: 'live',
    });
    expect(c.bucket).toBe('tournament_live');
    expect(c.updateTiming).toBe('deferred_bracket');
    expect(shouldDeferToBracketRating(c)).toBe(true);
    expect(shouldApplyImmediateFreePlayRating(c)).toBe(false);
  });

  test('tournament daily → tournament_daily', () => {
    const c = classifyGameForRating({
      ...baseFinished,
      play_context: 'tournament',
      tempo: 'daily',
    });
    expect(c.bucket).toBe('tournament_daily');
    expect(c.updateTiming).toBe('deferred_bracket');
  });

  test('not finished → none; bucket still classified for live default', () => {
    const c = classifyGameForRating({
      status: 'active',
      white_player_id: 'w1',
      black_player_id: 'b1',
      rated: true,
      tempo: 'live',
    });
    expect(c.updateTiming).toBe('none');
    expect(c.bucket).toBe('free_live');
    expect(c.skipReason).toBe('not_finished');
  });

  test('missing black → not_both_seated', () => {
    const c = classifyGameForRating({
      status: 'finished',
      white_player_id: 'w1',
      black_player_id: null,
      rated: true,
      tempo: 'live',
    });
    expect(c.skipReason).toBe('not_both_seated');
    expect(c.updateTiming).toBe('none');
  });
});

test.describe('ratingBuckets', () => {
  test('bucketForPlayContextAndPace maps to fixed live/daily/correspondence buckets', () => {
    expect(bucketForPlayContextAndPace('free', 'live')).toBe('free_live');
    expect(bucketForPlayContextAndPace('free', 'daily')).toBe('free_daily');
    expect(bucketForPlayContextAndPace('free', 'correspondence')).toBe('free_correspondence');
    expect(bucketForPlayContextAndPace('tournament', 'live')).toBe('tournament_live');
    expect(bucketForPlayContextAndPace('tournament', 'daily')).toBe('tournament_daily');
    expect(bucketForPlayContextAndPace('tournament', 'correspondence')).toBe('tournament_correspondence');
  });
});
