import { expect, test } from '@playwright/test';

import {
  BROAD_MODE_UNLOCK_THRESHOLD,
  EXACT_CONTROL_UNLOCK_THRESHOLD,
  broadModeRouteBSatisfied,
  resolveBroadModeUnlockState,
  resolveExactControlUnlockState,
  resolveSuccessfulPerformanceView,
} from '../../lib/profile/successfulPerformanceUnlock';
import type {
  ExactControlUnlockDescriptor,
  PlayerColor,
  RatingModeName,
  SuccessfulPerformanceAggregate,
} from '../../lib/profile/successfulPerformanceTypes';

function exact(count: number, color: PlayerColor = 'white') {
  return {
    mode: 'blitz' as RatingModeName,
    color,
    exactControl: '5+0',
    eligibleGames: count,
    sourceStatus: 'available' as const,
  };
}

const BLITZ_CONTROLS = ['3+0', '3+2', '5+0', '5+5'];

function desc(
  mode: RatingModeName,
  color: PlayerColor,
  exactControl: string,
  unlocked: boolean,
): ExactControlUnlockDescriptor {
  return { mode, color, exactControl, unlocked };
}

function allBlitzUnlocked(color: PlayerColor): ExactControlUnlockDescriptor[] {
  return BLITZ_CONTROLS.map((c) => desc('blitz', color, c, true));
}

test.describe('exact-control unlock', () => {
  test('constant is 10', () => {
    expect(EXACT_CONTROL_UNLOCK_THRESHOLD).toBe(10);
  });

  test('0/10 = locked', () => {
    expect(resolveExactControlUnlockState(exact(0))).toBe('locked');
  });

  test('1/10 = progress', () => {
    expect(resolveExactControlUnlockState(exact(1))).toBe('progress');
  });

  test('9/10 = progress', () => {
    expect(resolveExactControlUnlockState(exact(9))).toBe('progress');
  });

  test('10/10 = unlocked', () => {
    expect(resolveExactControlUnlockState(exact(10))).toBe('unlocked');
  });

  test('unavailable source = unavailable', () => {
    expect(
      resolveExactControlUnlockState({ ...exact(10), sourceStatus: 'unavailable' }),
    ).toBe('unavailable');
  });

  test('invalid count = invalid', () => {
    expect(resolveExactControlUnlockState(exact(-1))).toBe('invalid');
    expect(resolveExactControlUnlockState(exact(2.5))).toBe('invalid');
    expect(resolveExactControlUnlockState(exact(Number.NaN))).toBe('invalid');
  });

  test('White and Black are isolated (same control, different counts)', () => {
    const white = resolveExactControlUnlockState(exact(10, 'white'));
    const black = resolveExactControlUnlockState(exact(3, 'black'));
    expect(white).toBe('unlocked');
    expect(black).toBe('progress');
  });
});

test.describe('broad-mode unlock', () => {
  test('constant is 100', () => {
    expect(BROAD_MODE_UNLOCK_THRESHOLD).toBe(100);
  });

  function broad(count: number, color: PlayerColor, descriptors: ExactControlUnlockDescriptor[]) {
    return {
      mode: 'blitz' as RatingModeName,
      color,
      eligibleGames: count,
      sourceStatus: 'available' as const,
      requiredExactControls: BLITZ_CONTROLS,
      exactControlUnlocks: descriptors,
    };
  }

  test('99/100 remains progress (no Route B)', () => {
    expect(resolveBroadModeUnlockState(broad(99, 'white', []))).toBe('progress');
  });

  test('100/100 unlocks via Route A', () => {
    expect(resolveBroadModeUnlockState(broad(100, 'white', []))).toBe('unlocked');
  });

  test('all exact controls unlocked unlocks via Route B below 100', () => {
    expect(resolveBroadModeUnlockState(broad(20, 'white', allBlitzUnlocked('white')))).toBe(
      'unlocked',
    );
    expect(broadModeRouteBSatisfied(broad(20, 'white', allBlitzUnlocked('white')))).toBe(true);
  });

  test('one exact control still locked prevents Route B', () => {
    const descriptors = [
      desc('blitz', 'white', '3+0', true),
      desc('blitz', 'white', '3+2', true),
      desc('blitz', 'white', '5+0', false),
      desc('blitz', 'white', '5+5', true),
    ];
    expect(broadModeRouteBSatisfied(broad(20, 'white', descriptors))).toBe(false);
    expect(resolveBroadModeUnlockState(broad(20, 'white', descriptors))).toBe('progress');
  });

  test('controls from another mode cannot satisfy Route B', () => {
    const bulletUnlocked = ['1+0', '1+1', '2+0', '2+1'].map((c) =>
      desc('bullet', 'white', c, true),
    );
    expect(broadModeRouteBSatisfied(broad(20, 'white', bulletUnlocked))).toBe(false);
    expect(resolveBroadModeUnlockState(broad(20, 'white', bulletUnlocked))).toBe('progress');
  });

  test('White exact-control unlocks cannot unlock Black broad mode', () => {
    const whiteUnlocked = allBlitzUnlocked('white');
    expect(broadModeRouteBSatisfied(broad(5, 'black', whiteUnlocked))).toBe(false);
    expect(resolveBroadModeUnlockState(broad(5, 'black', whiteUnlocked))).toBe('progress');
  });

  test('0 games with no Route B = locked', () => {
    expect(resolveBroadModeUnlockState(broad(0, 'white', []))).toBe('locked');
  });

  test('zero eligibleGames with Route B satisfied returns locked, not unlocked', () => {
    expect(resolveBroadModeUnlockState(broad(0, 'white', allBlitzUnlocked('white')))).toBe('locked');
    expect(broadModeRouteBSatisfied(broad(0, 'white', allBlitzUnlocked('white')))).toBe(true);
  });
});

test.describe('resolveSuccessfulPerformanceView — percentage suppression + policy dispatch', () => {
  function baseAggregate(
    over: Partial<SuccessfulPerformanceAggregate>,
  ): SuccessfulPerformanceAggregate {
    return {
      scope: 'exact_control',
      mode: 'blitz',
      color: 'white',
      exactControl: '5+0',
      wins: 0,
      draws: 0,
      losses: 0,
      eligibleGames: 0,
      sourceStatus: 'available',
      ...over,
    };
  }

  test('exact-control unlocked with valid data exposes percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      baseAggregate({ wins: 6, draws: 2, losses: 2, eligibleGames: 10 }),
      { kind: 'exact_control' },
    );
    expect(view.state).toBe('unlocked');
    expect(view.percentage).toBeCloseTo(70, 10);
    expect(view.threshold).toBe(10);
  });

  test('progress state suppresses percentage even when data is valid', () => {
    const view = resolveSuccessfulPerformanceView(
      baseAggregate({ wins: 3, draws: 0, losses: 2, eligibleGames: 5 }),
      { kind: 'exact_control' },
    );
    expect(view.state).toBe('progress');
    expect(view.percentage).toBeNull();
    expect(view.progressCount).toBe(5);
  });

  test('locked state suppresses percentage', () => {
    const view = resolveSuccessfulPerformanceView(baseAggregate({}), { kind: 'exact_control' });
    expect(view.state).toBe('locked');
    expect(view.percentage).toBeNull();
  });

  test('unavailable source suppresses percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      baseAggregate({ sourceStatus: 'unavailable' }),
      { kind: 'exact_control' },
    );
    expect(view.state).toBe('unavailable');
    expect(view.percentage).toBeNull();
  });

  test('inconsistent data resolves to invalid, no percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      baseAggregate({ wins: 6, draws: 0, losses: 0, eligibleGames: 10 }),
      { kind: 'exact_control' },
    );
    expect(view.state).toBe('invalid');
    expect(view.percentage).toBeNull();
    expect(view.invalidReason).not.toBeNull();
  });

  test('no-threshold battlefield with data unlocks and shows percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      baseAggregate({
        scope: 'battlefield',
        mode: null,
        color: 'combined',
        exactControl: null,
        wins: 4,
        draws: 0,
        losses: 4,
        eligibleGames: 8,
      }),
      { kind: 'no_threshold' },
    );
    expect(view.state).toBe('unlocked');
    expect(view.threshold).toBeNull();
    expect(view.percentage).toBeCloseTo(50, 10);
  });

  test('no-threshold with zero games = insufficient_data, no percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      baseAggregate({
        scope: 'battlefield',
        mode: null,
        color: 'combined',
        exactControl: null,
      }),
      { kind: 'no_threshold' },
    );
    expect(view.state).toBe('insufficient_data');
    expect(view.percentage).toBeNull();
  });

  test('broad-mode Route B unlock below 100 shows percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      baseAggregate({
        scope: 'mode',
        exactControl: null,
        wins: 12,
        draws: 4,
        losses: 4,
        eligibleGames: 20,
      }),
      {
        kind: 'broad_mode',
        requiredExactControls: BLITZ_CONTROLS,
        exactControlUnlocks: allBlitzUnlocked('white'),
      },
    );
    expect(view.state).toBe('unlocked');
    expect(view.percentage).toBeCloseTo(70, 10);
  });

  test('broad-mode missing mode identity = invalid', () => {
    const view = resolveSuccessfulPerformanceView(
      baseAggregate({ scope: 'mode', mode: null, exactControl: null }),
      { kind: 'broad_mode', requiredExactControls: BLITZ_CONTROLS, exactControlUnlocks: [] },
    );
    expect(view.state).toBe('invalid');
  });
});

test.describe('count-contract correction — eligibleGames is the sole authoritative count', () => {
  function base(over: Partial<SuccessfulPerformanceAggregate>): SuccessfulPerformanceAggregate {
    return {
      scope: 'exact_control',
      mode: 'blitz',
      color: 'white',
      exactControl: '5+0',
      wins: 0,
      draws: 0,
      losses: 0,
      eligibleGames: 0,
      sourceStatus: 'available',
      ...over,
    };
  }

  test('exact-control eligibleGames 9 remains progress', () => {
    const v = resolveSuccessfulPerformanceView(
      base({ wins: 5, draws: 0, losses: 4, eligibleGames: 9 }),
      { kind: 'exact_control' },
    );
    expect(v.state).toBe('progress');
    expect(v.progressCount).toBe(9);
    expect(v.percentage).toBeNull();
  });

  test('exact-control eligibleGames 10 unlocks', () => {
    const v = resolveSuccessfulPerformanceView(
      base({ wins: 5, draws: 0, losses: 5, eligibleGames: 10 }),
      { kind: 'exact_control' },
    );
    expect(v.state).toBe('unlocked');
    expect(v.percentage).toBeCloseTo(50, 10);
  });

  test('broad-mode eligibleGames 99 remains progress without Route B', () => {
    const v = resolveSuccessfulPerformanceView(
      base({ scope: 'mode', exactControl: null, wins: 50, draws: 0, losses: 49, eligibleGames: 99 }),
      { kind: 'broad_mode', requiredExactControls: BLITZ_CONTROLS, exactControlUnlocks: [] },
    );
    expect(v.state).toBe('progress');
    expect(v.percentage).toBeNull();
  });

  test('broad-mode eligibleGames 100 unlocks through Route A', () => {
    const v = resolveSuccessfulPerformanceView(
      base({ scope: 'mode', exactControl: null, wins: 50, draws: 0, losses: 50, eligibleGames: 100 }),
      { kind: 'broad_mode', requiredExactControls: BLITZ_CONTROLS, exactControlUnlocks: [] },
    );
    expect(v.state).toBe('unlocked');
    expect(v.percentage).toBeCloseTo(50, 10);
  });

  test('Route B still unlocks below 100', () => {
    const v = resolveSuccessfulPerformanceView(
      base({ scope: 'mode', exactControl: null, wins: 20, draws: 0, losses: 20, eligibleGames: 40 }),
      {
        kind: 'broad_mode',
        requiredExactControls: BLITZ_CONTROLS,
        exactControlUnlocks: allBlitzUnlocked('white'),
      },
    );
    expect(v.state).toBe('unlocked');
    expect(v.percentage).toBeCloseTo(50, 10);
  });

  test('inconsistent W/D/L versus eligibleGames remains invalid', () => {
    const v = resolveSuccessfulPerformanceView(
      base({ wins: 5, draws: 0, losses: 0, eligibleGames: 10 }),
      { kind: 'exact_control' },
    );
    expect(v.state).toBe('invalid');
    expect(v.percentage).toBeNull();
  });

  test('no unlocked-with-zero-games state is possible (incl. Route B zero games)', () => {
    // Exact-control zero games -> locked, never unlocked.
    expect(
      resolveSuccessfulPerformanceView(base({}), { kind: 'exact_control' }).state,
    ).toBe('locked');

    // Broad-mode Route A zero games (no descriptors) -> locked.
    expect(
      resolveSuccessfulPerformanceView(
        base({ scope: 'mode', exactControl: null }),
        { kind: 'broad_mode', requiredExactControls: BLITZ_CONTROLS, exactControlUnlocks: [] },
      ).state,
    ).toBe('locked');

    // Broad-mode Route B satisfied but zero eligible games -> locked at resolver
    // and must NOT be unlocked in the composed view; no percentage is emitted.
    const routeBZero = resolveSuccessfulPerformanceView(
      base({ scope: 'mode', exactControl: null, wins: 0, draws: 0, losses: 0, eligibleGames: 0 }),
      {
        kind: 'broad_mode',
        requiredExactControls: BLITZ_CONTROLS,
        exactControlUnlocks: allBlitzUnlocked('white'),
      },
    );
    expect(routeBZero.state).toBe('locked');
    expect(routeBZero.percentage).toBeNull();

    // Property sweep: any unlocked view must carry a valid percentage and >0 games.
    const sweep = [
      resolveSuccessfulPerformanceView(base({ wins: 5, draws: 0, losses: 5, eligibleGames: 10 }), {
        kind: 'exact_control',
      }),
      resolveSuccessfulPerformanceView(
        base({ scope: 'mode', exactControl: null, wins: 50, draws: 0, losses: 50, eligibleGames: 100 }),
        { kind: 'broad_mode', requiredExactControls: BLITZ_CONTROLS, exactControlUnlocks: [] },
      ),
      resolveSuccessfulPerformanceView(
        base({
          scope: 'battlefield',
          mode: null,
          color: 'combined',
          exactControl: null,
          wins: 1,
          draws: 0,
          losses: 0,
          eligibleGames: 1,
        }),
        { kind: 'no_threshold' },
      ),
    ];
    for (const v of sweep) {
      if (v.state === 'unlocked') {
        expect(v.percentage).not.toBeNull();
        expect(v.eligibleGames).not.toBeNull();
        expect(v.eligibleGames as number).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('integration hazard hardening — identity validation and Route B zero games', () => {
  function base(over: Partial<SuccessfulPerformanceAggregate>): SuccessfulPerformanceAggregate {
    return {
      scope: 'exact_control',
      mode: 'blitz',
      color: 'white',
      exactControl: '5+0',
      wins: 0,
      draws: 0,
      losses: 0,
      eligibleGames: 0,
      sourceStatus: 'available',
      ...over,
    };
  }

  test('composed broad view with zero games and Route B satisfied stays locked with no percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      base({ scope: 'mode', exactControl: null, wins: 0, draws: 0, losses: 0, eligibleGames: 0 }),
      {
        kind: 'broad_mode',
        requiredExactControls: BLITZ_CONTROLS,
        exactControlUnlocks: allBlitzUnlocked('white'),
      },
    );
    expect(view.state).toBe('locked');
    expect(view.percentage).toBeNull();
  });

  test.describe('exact-control policy identity rejection', () => {
    const cases: Array<{ label: string; over: Partial<SuccessfulPerformanceAggregate> }> = [
      { label: 'missing exactControl', over: { exactControl: null } },
      { label: 'empty exactControl', over: { exactControl: '' } },
      { label: 'whitespace-only exactControl', over: { exactControl: '   ' } },
      { label: 'non-exact-control scope', over: { scope: 'mode', exactControl: null } },
      { label: 'combined color', over: { color: 'combined' } },
    ];

    for (const { label, over } of cases) {
      test(`rejects ${label}`, () => {
        const view = resolveSuccessfulPerformanceView(base(over), { kind: 'exact_control' });
        expect(view.state).toBe('invalid');
        expect(view.percentage).toBeNull();
      });
    }

    test('missing mode is invalid', () => {
      const view = resolveSuccessfulPerformanceView(base({ mode: null }), { kind: 'exact_control' });
      expect(view.state).toBe('invalid');
      expect(view.percentage).toBeNull();
    });
  });

  test.describe('broad-mode policy identity rejection', () => {
    const cases: Array<{ label: string; over: Partial<SuccessfulPerformanceAggregate> }> = [
      { label: 'non-mode scope', over: { scope: 'exact_control' } },
      { label: 'combined color', over: { scope: 'mode', exactControl: null, color: 'combined' } },
    ];

    for (const { label, over } of cases) {
      test(`rejects ${label}`, () => {
        const view = resolveSuccessfulPerformanceView(base(over), {
          kind: 'broad_mode',
          requiredExactControls: BLITZ_CONTROLS,
          exactControlUnlocks: allBlitzUnlocked('white'),
        });
        expect(view.state).toBe('invalid');
        expect(view.percentage).toBeNull();
      });
    }

    test('missing mode is invalid', () => {
      const view = resolveSuccessfulPerformanceView(
        base({ scope: 'mode', mode: null, exactControl: null }),
        { kind: 'broad_mode', requiredExactControls: BLITZ_CONTROLS, exactControlUnlocks: [] },
      );
      expect(view.state).toBe('invalid');
      expect(view.percentage).toBeNull();
    });
  });

  test('valid White and Black exact-control inputs still work independently', () => {
    const white = resolveSuccessfulPerformanceView(
      base({ wins: 5, draws: 0, losses: 5, eligibleGames: 10, color: 'white' }),
      { kind: 'exact_control' },
    );
    const black = resolveSuccessfulPerformanceView(
      base({
        wins: 2,
        draws: 0,
        losses: 3,
        eligibleGames: 5,
        color: 'black',
      }),
      { kind: 'exact_control' },
    );
    expect(white.state).toBe('unlocked');
    expect(white.percentage).toBeCloseTo(50, 10);
    expect(black.state).toBe('progress');
    expect(black.percentage).toBeNull();
  });

  test('valid broad Route A and Route B still work', () => {
    const routeA = resolveSuccessfulPerformanceView(
      base({ scope: 'mode', exactControl: null, wins: 50, draws: 0, losses: 50, eligibleGames: 100 }),
      { kind: 'broad_mode', requiredExactControls: BLITZ_CONTROLS, exactControlUnlocks: [] },
    );
    const routeB = resolveSuccessfulPerformanceView(
      base({ scope: 'mode', exactControl: null, wins: 20, draws: 0, losses: 20, eligibleGames: 40 }),
      {
        kind: 'broad_mode',
        requiredExactControls: BLITZ_CONTROLS,
        exactControlUnlocks: allBlitzUnlocked('white'),
      },
    );
    expect(routeA.state).toBe('unlocked');
    expect(routeA.percentage).toBeCloseTo(50, 10);
    expect(routeB.state).toBe('unlocked');
    expect(routeB.percentage).toBeCloseTo(50, 10);
  });

  test('percentage suppression remains unchanged for progress and locked', () => {
    const progress = resolveSuccessfulPerformanceView(
      base({ wins: 3, draws: 0, losses: 2, eligibleGames: 5 }),
      { kind: 'exact_control' },
    );
    const locked = resolveSuccessfulPerformanceView(base({}), { kind: 'exact_control' });
    expect(progress.state).toBe('progress');
    expect(progress.percentage).toBeNull();
    expect(locked.state).toBe('locked');
    expect(locked.percentage).toBeNull();
  });
});

test.describe('no-threshold scope validation', () => {
  function base(over: Partial<SuccessfulPerformanceAggregate>): SuccessfulPerformanceAggregate {
    return {
      scope: 'battlefield',
      mode: null,
      color: 'combined',
      exactControl: null,
      wins: 0,
      draws: 0,
      losses: 0,
      eligibleGames: 0,
      sourceStatus: 'available',
      ...over,
    };
  }

  test('no_threshold + battlefield remains valid', () => {
    const view = resolveSuccessfulPerformanceView(
      base({ wins: 4, draws: 0, losses: 4, eligibleGames: 8 }),
      { kind: 'no_threshold' },
    );
    expect(view.state).toBe('unlocked');
    expect(view.percentage).toBeCloseTo(50, 10);
  });

  test('no_threshold + tournament remains valid', () => {
    const view = resolveSuccessfulPerformanceView(
      base({
        scope: 'tournament',
        wins: 6,
        draws: 0,
        losses: 4,
        eligibleGames: 10,
      }),
      { kind: 'no_threshold' },
    );
    expect(view.state).toBe('unlocked');
    expect(view.percentage).toBeCloseTo(60, 10);
  });

  test('no_threshold + exact_control is invalid and exposes no percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      base({
        scope: 'exact_control',
        mode: 'blitz',
        color: 'white',
        exactControl: '5+0',
        wins: 6,
        draws: 2,
        losses: 2,
        eligibleGames: 10,
      }),
      { kind: 'no_threshold' },
    );
    expect(view.state).toBe('invalid');
    expect(view.percentage).toBeNull();
  });

  test('no_threshold + mode is invalid and exposes no percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      base({
        scope: 'mode',
        mode: 'blitz',
        color: 'white',
        wins: 50,
        draws: 0,
        losses: 50,
        eligibleGames: 100,
      }),
      { kind: 'no_threshold' },
    );
    expect(view.state).toBe('invalid');
    expect(view.percentage).toBeNull();
  });

  test('no_threshold + overall is invalid and exposes no percentage', () => {
    const view = resolveSuccessfulPerformanceView(
      base({
        scope: 'overall',
        mode: null,
        color: 'combined',
        wins: 20,
        draws: 0,
        losses: 0,
        eligibleGames: 20,
      }),
      { kind: 'no_threshold' },
    );
    expect(view.state).toBe('invalid');
    expect(view.percentage).toBeNull();
  });

  test('invalid no-threshold scope cannot bypass the 10-game exact-control gate', () => {
    const view = resolveSuccessfulPerformanceView(
      base({
        scope: 'exact_control',
        mode: 'blitz',
        color: 'white',
        exactControl: '5+0',
        wins: 10,
        draws: 0,
        losses: 0,
        eligibleGames: 10,
      }),
      { kind: 'no_threshold' },
    );
    expect(view.state).toBe('invalid');
    expect(view.percentage).toBeNull();
    const gated = resolveSuccessfulPerformanceView(
      base({
        scope: 'exact_control',
        mode: 'blitz',
        color: 'white',
        exactControl: '5+0',
        wins: 5,
        draws: 0,
        losses: 5,
        eligibleGames: 10,
      }),
      { kind: 'exact_control' },
    );
    expect(gated.state).toBe('unlocked');
    expect(gated.percentage).toBeCloseTo(50, 10);
  });

  test('invalid no-threshold scope cannot bypass the 100-game broad-mode gate', () => {
    const view = resolveSuccessfulPerformanceView(
      base({
        scope: 'mode',
        mode: 'blitz',
        color: 'white',
        wins: 100,
        draws: 0,
        losses: 0,
        eligibleGames: 100,
      }),
      { kind: 'no_threshold' },
    );
    expect(view.state).toBe('invalid');
    expect(view.percentage).toBeNull();
    const gated = resolveSuccessfulPerformanceView(
      base({
        scope: 'mode',
        mode: 'blitz',
        color: 'white',
        wins: 50,
        draws: 0,
        losses: 50,
        eligibleGames: 100,
      }),
      {
        kind: 'broad_mode',
        requiredExactControls: BLITZ_CONTROLS,
        exactControlUnlocks: [],
      },
    );
    expect(gated.state).toBe('unlocked');
    expect(gated.percentage).toBeCloseTo(50, 10);
  });

  test('existing exact-control and broad-mode policies still behave unchanged', () => {
    const exact = resolveSuccessfulPerformanceView(
      base({
        scope: 'exact_control',
        mode: 'blitz',
        color: 'white',
        exactControl: '5+0',
        wins: 5,
        draws: 0,
        losses: 5,
        eligibleGames: 10,
      }),
      { kind: 'exact_control' },
    );
    const broad = resolveSuccessfulPerformanceView(
      base({
        scope: 'mode',
        mode: 'blitz',
        color: 'white',
        wins: 50,
        draws: 0,
        losses: 50,
        eligibleGames: 100,
      }),
      { kind: 'broad_mode', requiredExactControls: BLITZ_CONTROLS, exactControlUnlocks: [] },
    );
    expect(exact.state).toBe('unlocked');
    expect(exact.percentage).toBeCloseTo(50, 10);
    expect(broad.state).toBe('unlocked');
    expect(broad.percentage).toBeCloseTo(50, 10);
  });
});
