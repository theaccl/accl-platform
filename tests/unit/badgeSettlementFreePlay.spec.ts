import { test, expect } from '@playwright/test';

import {
  defaultPlayerBadgeState,
  settlePlayerBadgeState,
  type PlayerBadgeStateRow,
} from '../../lib/badgeSettlement';

const TRACK = 'blitz_3_2' as const;

function stateAt(rating: number, overrides: Partial<PlayerBadgeStateRow> = {}): PlayerBadgeStateRow {
  return {
    ...defaultPlayerBadgeState(TRACK),
    settlement_rating: rating,
    active_rank_band: 'c',
    ...overrides,
  };
}

test.describe('free-play badge settlement — demotion', () => {
  test('1401 → 1375 arms demotion without downgrade', () => {
    const prev = stateAt(1401, { active_rank_band: 'c', visual_state: 'normal' });
    const { state, ticker } = settlePlayerBadgeState({
      previous: prev,
      trackKey: TRACK,
      ratingBefore: 1401,
      ratingAfter: 1375,
      delta: -26,
    });
    expect(state.pressure_state).toBe('demotion_armed');
    expect(state.visual_state).toBe('normal');
    expect(ticker.event_type).toBe('demotion_armed');
  });

  test('armed + rating loss below recovery confirms downgrade', () => {
    const prev = stateAt(1396, {
      pressure_state: 'demotion_armed',
      pressure_border: 1400,
      visual_state: 'normal',
    });
    const { state, ticker } = settlePlayerBadgeState({
      previous: prev,
      trackKey: TRACK,
      ratingBefore: 1396,
      ratingAfter: 1388,
      delta: -8,
    });
    expect(state.visual_state).toBe('downgraded');
    expect(state.pressure_state).toBe('stable');
    expect(ticker.event_type).toBe('demotion_confirmed');
  });

  test('recovery to 1400+ clears demotion pressure', () => {
    const prev = stateAt(1375, {
      pressure_state: 'demotion_armed',
      pressure_border: 1400,
    });
    const { state, ticker } = settlePlayerBadgeState({
      previous: prev,
      trackKey: TRACK,
      ratingBefore: 1375,
      ratingAfter: 1401,
      delta: 26,
    });
    expect(state.pressure_state).toBe('stable');
    expect(state.pressure_border).toBeNull();
    expect(state.visual_state).toBe('normal');
    expect(ticker.event_type).toBe('demotion_pressure_cleared');
  });

  test('wins inside danger do not clear unless recovered', () => {
    let prev = stateAt(1375, {
      pressure_state: 'demotion_armed',
      pressure_border: 1400,
    });
    let r = settlePlayerBadgeState({
      previous: prev,
      trackKey: TRACK,
      ratingBefore: 1375,
      ratingAfter: 1384,
      delta: 9,
    });
    expect(r.state.pressure_state).toBe('demotion_armed');
    prev = r.state;
    r = settlePlayerBadgeState({
      previous: prev,
      trackKey: TRACK,
      ratingBefore: 1384,
      ratingAfter: 1396,
      delta: 12,
    });
    expect(r.state.pressure_state).toBe('demotion_armed');
    r = settlePlayerBadgeState({
      previous: r.state,
      trackKey: TRACK,
      ratingBefore: 1396,
      ratingAfter: 1388,
      delta: -8,
    });
    expect(r.state.visual_state).toBe('downgraded');
  });
});

test.describe('free-play badge settlement — streak upgrade', () => {
  test('three wins in track earn upgraded; one loss reverts to normal', () => {
    let prev = stateAt(1500);
    for (const after of [1510, 1520, 1530]) {
      const before = prev.settlement_rating;
      const r = settlePlayerBadgeState({
        previous: prev,
        trackKey: TRACK,
        ratingBefore: before,
        ratingAfter: after,
        delta: 10,
      });
      prev = r.state;
    }
    expect(prev.visual_state).toBe('upgraded');
    expect(prev.win_streak).toBe(3);

    const lost = settlePlayerBadgeState({
      previous: prev,
      trackKey: TRACK,
      ratingBefore: 1530,
      ratingAfter: 1520,
      delta: -10,
    });
    expect(lost.state.visual_state).toBe('normal');
    expect(lost.state.win_streak).toBe(0);
    expect(lost.ticker.event_type).toBe('upgrade_lost_on_defeat');
  });
});

test.describe('free-play badge settlement — downgrade repair', () => {
  test('one win repairs downgraded to normal without upgraded', () => {
    const prev = stateAt(1380, { visual_state: 'downgraded', active_rank_band: 'd' });
    const { state } = settlePlayerBadgeState({
      previous: prev,
      trackKey: TRACK,
      ratingBefore: 1380,
      ratingAfter: 1390,
      delta: 10,
    });
    expect(state.visual_state).toBe('normal');
    expect(state.win_streak).toBe(1);
  });
});

test.describe('free-play badge settlement — track isolation', () => {
  test('loss in another track does not remove upgraded shiny', () => {
    const upgraded = stateAt(1500, { visual_state: 'upgraded', win_streak: 3 });
    const otherTrack = 'bullet_1_1' as const;
    const { state } = settlePlayerBadgeState({
      previous: { ...upgraded, track_key: otherTrack },
      trackKey: otherTrack,
      ratingBefore: 1500,
      ratingAfter: 1490,
      delta: -10,
    });
    expect(state.visual_state).toBe('normal');
    expect(upgraded.visual_state).toBe('upgraded');
  });
});

test.describe('free-play badge settlement — draw', () => {
  test('delta 0 does not confirm demotion or promotion', () => {
    const prev = stateAt(1375, {
      pressure_state: 'demotion_armed',
      pressure_border: 1400,
    });
    const { state } = settlePlayerBadgeState({
      previous: prev,
      trackKey: TRACK,
      ratingBefore: 1375,
      ratingAfter: 1375,
      delta: 0,
    });
    expect(state.pressure_state).toBe('demotion_armed');
    expect(state.visual_state).toBe('normal');
  });

  test.skip('draw with negative ELO confirms demotion when non-zero draw deltas exist', () => {
    // Enable when draw rating deltas are implemented.
  });
});
