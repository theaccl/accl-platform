import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { successfulPerformanceCardModel } from '../../lib/profile/successfulPerformanceCardModel';
import { resolveSuccessfulPerformanceView } from '../../lib/profile/successfulPerformanceUnlock';
import type { SuccessfulPerformanceAggregate } from '../../lib/profile/successfulPerformanceTypes';

/**
 * The card is presentational and renders the pure `successfulPerformanceCardModel`
 * verbatim, so exercising the model is equivalent to exercising the card's render
 * decisions — without a DOM (and without Playwright's JSX transform interfering).
 */
function model(
  aggregate: SuccessfulPerformanceAggregate,
  policy: Parameters<typeof resolveSuccessfulPerformanceView>[1],
) {
  return successfulPerformanceCardModel(resolveSuccessfulPerformanceView(aggregate, policy));
}

function exactAggregate(
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

test.describe('SuccessfulPerformanceCard model — percentage exposure', () => {
  test('unlocked with valid data exposes the percentage text', () => {
    const m = model(
      exactAggregate({ wins: 6, draws: 2, losses: 2, eligibleGames: 10 }),
      { kind: 'exact_control' },
    );
    expect(m.showPercentage).toBe(true);
    expect(m.percentageText).toBe('70%');
  });

  test('locked hides the percentage', () => {
    const m = model(exactAggregate({}), { kind: 'exact_control' });
    expect(m.showPercentage).toBe(false);
    expect(m.percentageText).toBeNull();
  });

  test('progress hides the percentage and exposes a progress bar', () => {
    const m = model(
      exactAggregate({ wins: 3, draws: 0, losses: 2, eligibleGames: 5 }),
      { kind: 'exact_control' },
    );
    expect(m.showPercentage).toBe(false);
    expect(m.percentageText).toBeNull();
    expect(m.showProgressBar).toBe(true);
    expect(m.progressPct).toBeCloseTo(50, 10);
  });

  test('unavailable hides the percentage', () => {
    const m = model(exactAggregate({ sourceStatus: 'unavailable' }), {
      kind: 'exact_control',
    });
    expect(m.showPercentage).toBe(false);
    expect(m.percentageText).toBeNull();
  });

  test('invalid hides the percentage', () => {
    const m = model(
      exactAggregate({ wins: 6, draws: 0, losses: 0, eligibleGames: 10 }),
      { kind: 'exact_control' },
    );
    expect(m.showPercentage).toBe(false);
    expect(m.percentageText).toBeNull();
  });

  test('insufficient_data (no-threshold, zero games) hides the percentage', () => {
    const m = model(
      exactAggregate({ scope: 'battlefield', mode: null, color: 'combined', exactControl: null }),
      { kind: 'no_threshold' },
    );
    expect(m.showPercentage).toBe(false);
    expect(m.percentageText).toBeNull();
  });

  test('no-threshold with valid data shows the percentage', () => {
    const m = model(
      exactAggregate({
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
    expect(m.showPercentage).toBe(true);
    expect(m.percentageText).toBe('50%');
  });
});

test.describe('SuccessfulPerformanceCard model — readable state text (not color-only)', () => {
  const cases: Array<{
    aggregate: SuccessfulPerformanceAggregate;
    policy: Parameters<typeof resolveSuccessfulPerformanceView>[1];
    label: string;
  }> = [
    { aggregate: exactAggregate({}), policy: { kind: 'exact_control' }, label: 'Locked' },
    {
      aggregate: exactAggregate({ wins: 3, draws: 0, losses: 2, eligibleGames: 5 }),
      policy: { kind: 'exact_control' },
      label: 'In progress',
    },
    {
      aggregate: exactAggregate({ wins: 6, draws: 2, losses: 2, eligibleGames: 10 }),
      policy: { kind: 'exact_control' },
      label: 'Unlocked',
    },
    {
      aggregate: exactAggregate({ sourceStatus: 'unavailable' }),
      policy: { kind: 'exact_control' },
      label: 'Not available',
    },
    {
      aggregate: exactAggregate({ wins: 6, draws: 0, losses: 0, eligibleGames: 10 }),
      policy: { kind: 'exact_control' },
      label: 'Data error',
    },
  ];

  for (const { aggregate, policy, label } of cases) {
    test(`state label present: ${label}`, () => {
      const m = model(aggregate, policy);
      expect(m.stateLabel).toBe(label);
      expect(m.stateLabel.length).toBeGreaterThan(0);
      expect(m.supportText).not.toBeNull();
      expect(m.title.length).toBeGreaterThan(0);
    });
  }
});

test.describe('SuccessfulPerformanceCard — no live Profile wiring (regression guard)', () => {
  const root = process.cwd();

  test('the card renders the pure model and does not fetch or aggregate', () => {
    const card = readFileSync(
      join(root, 'components', 'profile', 'ratings', 'SuccessfulPerformanceCard.tsx'),
      'utf8',
    );
    expect(card).toContain('successfulPerformanceCardModel');
    expect(card).not.toContain('useEffect');
    expect(card).not.toContain('useState');
    expect(card).not.toContain('supabase');
    expect(card).not.toContain('fetch(');
    // Percentage element must be gated behind the model's showPercentage decision.
    expect(card).toContain('model.showPercentage');
  });

  test('ProfileRatingsDashboard does not import or reference SuccessfulPerformance', () => {
    const dashboard = readFileSync(
      join(root, 'components', 'profile', 'ratings', 'ProfileRatingsDashboard.tsx'),
      'utf8',
    );
    expect(dashboard.toLowerCase()).not.toContain('successfulperformance');
  });

  test('no live profile route or component imports the card', () => {
    const profilePage = readFileSync(join(root, 'app', 'profile', '[id]', 'page.tsx'), 'utf8');
    const profileRatings = readFileSync(
      join(root, 'components', 'profile', 'ProfileRatings.tsx'),
      'utf8',
    );
    expect(profilePage.toLowerCase()).not.toContain('successfulperformance');
    expect(profileRatings.toLowerCase()).not.toContain('successfulperformance');
  });
});

test.describe('successfulPerformance — purity / capped-read regression guards', () => {
  const root = process.cwd();
  const FORBIDDEN = [
    'loadProfileRatingDashboard',
    'ratingHistoryMetrics',
    'profileRatingHistoryBuild',
    'ratingHistoryLedgerBuild',
    'profileRatingTrackGameCounts',
    'supabaseClient',
    '@supabase/',
    'eloRating',
    "from('games')",
    "from('player_rating_history_ledger')",
  ];

  const productionFiles = [
    join(root, 'lib', 'profile', 'successfulPerformance.ts'),
    join(root, 'lib', 'profile', 'successfulPerformanceUnlock.ts'),
    join(root, 'lib', 'profile', 'successfulPerformanceTypes.ts'),
    join(root, 'lib', 'profile', 'successfulPerformanceCardModel.ts'),
    join(root, 'components', 'profile', 'ratings', 'SuccessfulPerformanceCard.tsx'),
  ];

  for (const file of productionFiles) {
    test(`no forbidden data/loader imports in ${file.split(/[\\/]/).pop()}`, () => {
      const src = readFileSync(file, 'utf8');
      for (const needle of FORBIDDEN) {
        expect(src, `${needle} must not appear in ${file}`).not.toContain(needle);
      }
    });
  }

  // The removed count field must not survive anywhere in the foundation. The token
  // is assembled at runtime so this assertion file does not itself contain it.
  const removedCountToken = ['sample', 'Count'].join('');
  const allEightFiles = [
    ...productionFiles,
    join(root, 'tests', 'unit', 'successfulPerformanceScoring.spec.ts'),
    join(root, 'tests', 'unit', 'successfulPerformanceUnlock.spec.ts'),
    join(root, 'tests', 'unit', 'successfulPerformanceCard.spec.ts'),
  ];

  for (const file of allEightFiles) {
    test(`no removed count token in ${file.split(/[\\/]/).pop()}`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src, `${removedCountToken} must not appear in ${file}`).not.toContain(
        removedCountToken,
      );
    });
  }
});
