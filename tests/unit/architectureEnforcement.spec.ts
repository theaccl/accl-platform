import { test, expect } from '@playwright/test';

import {
  RATING_BUCKETS,
  bucketForPlayContextAndPace,
  isRatingBucket,
} from '../../lib/ratingBuckets';
import {
  classifyGameForRating,
  shouldApplyImmediateFreePlayRating,
  shouldDeferToBracketRating,
} from '../../lib/ratingClassification';
import { isGameRecordFinished } from '../../lib/finishedGame';
import {
  isBoardReadyGame,
  isLobbyNonFinishedGame,
  isWaitingForOpponentSeat,
  pickExistingActiveGameForRedirect,
} from '../../lib/freePlayLobby';

const FIXED_ACCL_BUCKET_NAMESPACE = [
  'free_live',
  'free_daily',
  'free_correspondence',
  'tournament_live',
  'tournament_daily',
  'tournament_correspondence',
] as const;

test.describe('ACCL architecture enforcement: fixed bucket namespace', () => {
  test('accepted rating bucket namespace is exactly the fixed ACCL set', () => {
    expect([...RATING_BUCKETS]).toEqual(FIXED_ACCL_BUCKET_NAMESPACE);
  });

  test('speed-class buckets are rejected by bucket validators', () => {
    expect(isRatingBucket('free_bullet')).toBe(false);
    expect(isRatingBucket('free_blitz')).toBe(false);
    expect(isRatingBucket('free_rapid')).toBe(false);
    expect(isRatingBucket('tournament_bullet')).toBe(false);
    expect(isRatingBucket('tournament_blitz')).toBe(false);
    expect(isRatingBucket('tournament_rapid')).toBe(false);
  });

  test('pace mapping stays on fixed live/daily/correspondence buckets', () => {
    expect(bucketForPlayContextAndPace('free', 'live')).toBe('free_live');
    expect(bucketForPlayContextAndPace('free', 'daily')).toBe('free_daily');
    expect(bucketForPlayContextAndPace('free', 'correspondence')).toBe('free_correspondence');
    expect(bucketForPlayContextAndPace('tournament', 'live')).toBe('tournament_live');
    expect(bucketForPlayContextAndPace('tournament', 'daily')).toBe('tournament_daily');
    expect(bucketForPlayContextAndPace('tournament', 'correspondence')).toBe(
      'tournament_correspondence'
    );
  });
});

test.describe('ACCL architecture enforcement: finished-game immutability surfaces', () => {
  test('finished rows are excluded from active/waiting/open-seat lobby behavior', () => {
    const finishedSeated = {
      id: 'g-finished',
      status: 'finished',
      white_player_id: 'w',
      black_player_id: 'b',
    };
    const activeOpenSeat = {
      id: 'g-active-open',
      status: 'active',
      white_player_id: 'w2',
      black_player_id: null,
    };

    expect(isGameRecordFinished(finishedSeated)).toBe(true);
    expect(isLobbyNonFinishedGame(finishedSeated)).toBe(false);
    expect(isBoardReadyGame(finishedSeated)).toBe(false);
    expect(isWaitingForOpponentSeat(finishedSeated)).toBe(false);
    expect(pickExistingActiveGameForRedirect([finishedSeated, activeOpenSeat])).toEqual(activeOpenSeat);
  });
});

test.describe('ACCL architecture enforcement: deferred tournament rating milestones', () => {
  test('finished tournament rated games classify as deferred and never immediate', () => {
    const c = classifyGameForRating({
      status: 'finished',
      white_player_id: 'w',
      black_player_id: 'b',
      play_context: 'tournament',
      tempo: 'correspondence',
      rated: true,
    });

    expect(c.bucket).toBe('tournament_correspondence');
    expect(c.updateTiming).toBe('deferred_bracket');
    expect(shouldDeferToBracketRating(c)).toBe(true);
    expect(shouldApplyImmediateFreePlayRating(c)).toBe(false);
  });
});
