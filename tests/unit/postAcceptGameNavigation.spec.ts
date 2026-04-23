import { expect, test } from '@playwright/test';

import {
  getAcceptRedirectDecision,
  mergeCurrentGameForAcceptNavigation,
  shouldNavigateToAcceptedGame,
} from '../../lib/postAcceptGameNavigation';

test.describe('postAcceptGameNavigation', () => {
  const liveId = '11111111-1111-1111-1111-111111111111';
  const dailyId = '22222222-2222-2222-2222-222222222222';
  const dailyB = '33333333-3333-3333-3333-333333333333';

  test('on /game/liveId, accept daily => no navigation', () => {
    const d = getAcceptRedirectDecision({
      currentPath: `/game/${liveId}`,
      currentGame: { id: liveId, tempo: 'live' },
      acceptedGame: { id: dailyId, tempo: 'daily' },
    });
    expect(d.navigate).toBe(false);
    expect(shouldNavigateToAcceptedGame({
      currentPath: `/game/${liveId}`,
      currentGame: { id: liveId, tempo: 'live' },
      acceptedGame: { id: dailyId, tempo: 'daily' },
    })).toBe(false);
  });

  test('on /game/liveId, accept correspondence => no navigation', () => {
    const d = getAcceptRedirectDecision({
      currentPath: `/game/${liveId}`,
      currentGame: { id: liveId, tempo: 'live' },
      acceptedGame: { id: dailyB, tempo: 'correspondence' },
    });
    expect(d.navigate).toBe(false);
  });

  test('on /game/currentDailyId, accept live => navigation', () => {
    const d = getAcceptRedirectDecision({
      currentPath: `/game/${dailyId}`,
      currentGame: { id: dailyId, tempo: 'daily' },
      acceptedGame: { id: liveId, tempo: 'live' },
    });
    expect(d.navigate).toBe(true);
  });

  test('on /game/correspondenceId, accept live => navigation', () => {
    const corrId = '44444444-4444-4444-4444-444444444444';
    expect(
      getAcceptRedirectDecision({
        currentPath: `/game/${corrId}`,
        currentGame: { id: corrId, tempo: 'correspondence' },
        acceptedGame: { id: liveId, tempo: 'live' },
      }).navigate
    ).toBe(true);
  });

  test('same accepted game id as current board => no navigation', () => {
    expect(
      getAcceptRedirectDecision({
        currentPath: `/game/${liveId}`,
        currentGame: { id: liveId, tempo: 'live' },
        acceptedGame: { id: liveId, tempo: 'daily' },
      }).navigate
    ).toBe(false);
    expect(
      getAcceptRedirectDecision({
        currentPath: `/game/${liveId}`,
        currentGame: { id: liveId, tempo: 'live' },
        acceptedGame: { id: liveId, tempo: 'live' },
      }).navigate
    ).toBe(false);
  });

  test('already on accepted game URL => no navigation', () => {
    expect(
      getAcceptRedirectDecision({
        currentPath: `/game/${dailyId}`,
        currentGame: null,
        acceptedGame: { id: dailyId, tempo: 'daily' },
      }).navigate
    ).toBe(false);
  });

  test('on board but missing current game context => no navigation', () => {
    const d = getAcceptRedirectDecision({
      currentPath: `/game/${liveId}`,
      currentGame: null,
      acceptedGame: { id: dailyId, tempo: 'daily' },
    });
    expect(d.navigate).toBe(false);
    expect(d.reason).toBe('on-board-missing-current-game');
  });

  test('currentGame null BUT pathname /game/live + in-memory live blocks daily (hard rule)', () => {
    const d = getAcceptRedirectDecision({
      currentPath: `/game/${liveId}`,
      currentGame: null,
      acceptedGame: { id: dailyId, tempo: 'daily' },
      inMemoryBoardGame: { id: liveId, tempo: 'live' },
      pathBoardFromDb: null,
    });
    expect(d.navigate).toBe(false);
    expect(d.reason).toBe('hard-live-board-block');
  });

  test('hard rule prefers in-memory live over stale path DB row', () => {
    const d = getAcceptRedirectDecision({
      currentPath: `/game/${liveId}`,
      currentGame: { id: liveId, tempo: 'correspondence' },
      acceptedGame: { id: dailyId, tempo: 'daily' },
      inMemoryBoardGame: { id: liveId, tempo: 'live' },
      pathBoardFromDb: { id: liveId, tempo: 'correspondence' },
    });
    expect(d.navigate).toBe(false);
    expect(d.reason).toBe('hard-live-board-block');
  });

  test('missing DB-style current but pathname + in-memory live => no navigation', () => {
    expect(
      getAcceptRedirectDecision({
        currentPath: `/game/${liveId}`,
        currentGame: { id: liveId, tempo: 'live' },
        acceptedGame: { id: dailyId, tempo: 'daily' },
      }).navigate
    ).toBe(false);
  });

  test('not on /game/ and no current => navigate', () => {
    expect(
      getAcceptRedirectDecision({
        currentPath: '/requests',
        currentGame: null,
        acceptedGame: { id: dailyId, tempo: 'daily' },
      }).navigate
    ).toBe(true);
  });

  test('mergeCurrentGameForAcceptNavigation prefers in-memory board over path DB row', () => {
    const pathId = liveId;
    const merged = mergeCurrentGameForAcceptNavigation({
      pathname: `/game/${pathId}`,
      acceptedGameId: dailyId,
      inMemoryBoardGame: { id: pathId, tempo: 'live' },
      pathGameFromDb: { id: pathId, tempo: 'correspondence' },
      offPathActiveGameFromDb: null,
    });
    expect(merged).toEqual({ id: pathId, tempo: 'live' });
  });
});
