import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

test.describe('ProfileRatingsDashboard Successful Performance wiring', () => {
  const dashboard = src('components/profile/ratings/ProfileRatingsDashboard.tsx');

  test('imports dedicated self-only loader and SuccessfulPerformanceCard', () => {
    expect(dashboard).toContain('loadOwnSuccessfulPerformance');
    expect(dashboard).toContain('SuccessfulPerformanceCard');
    expect(dashboard).toContain('resolveSuccessfulPerformanceView');
    expect(dashboard).toContain('broadModeUnlockPolicyForMode');
  });

  test('loader invocation is gated by isSelf', () => {
    expect(dashboard).toContain('if (!isSelf)');
    expect(dashboard).toContain('loadOwnSuccessfulPerformance(supabase)');
    expect(dashboard).toMatch(/useEffect\([\s\S]*isSelf[\s\S]*loadOwnSuccessfulPerformance/);
  });

  test('true-to-false isSelf transition clears Successful Performance state immediately', () => {
    expect(dashboard).toContain('setSuccessfulPerformance(null)');
    expect(dashboard).toContain('setSuccessfulPerformanceLoading(false)');
    expect(dashboard).toMatch(
      /if \(!isSelf\) \{[\s\S]*setSuccessfulPerformance\(null\)[\s\S]*setSuccessfulPerformanceLoading\(false\)/,
    );
  });

  test('stale-request cancellation protection is present', () => {
    expect(dashboard).toContain('let cancelled = false');
    expect(dashboard).toContain('if (cancelled) return');
    expect(dashboard).toContain('cancelled = true');
  });

  test('selected broad-mode White/Black rendering uses active card mode', () => {
    expect(dashboard).toContain('broadModeSuccessfulPerformanceViews');
    expect(dashboard).toContain('profile-successful-performance-broad-mode');
    expect(dashboard).toContain('selectedMode');
    expect(dashboard).toContain('aggregates.white');
    expect(dashboard).toContain('aggregates.black');
  });

  test('non-mode selection hides broad-mode batteries via selectedMode guard', () => {
    expect(dashboard).toContain('const selectedMode = activeCard?.mode ?? null');
    expect(dashboard).toMatch(/if \(!selectedMode \|\| successfulPerformance\?\.status !== 'loaded'\)/);
    expect(dashboard).toContain('broadModeSuccessfulPerformanceViews ?');
  });

  test('battlefield lifetime rendering is independent of mode selection', () => {
    expect(dashboard).toContain('battlefieldSuccessfulPerformanceView');
    expect(dashboard).toContain('profile-successful-performance-battlefield');
    expect(dashboard).toContain("kind: 'no_threshold'");
    expect(dashboard).not.toMatch(
      /battlefieldSuccessfulPerformanceView[\s\S]*selectedMode/,
    );
  });

  test('loading, unavailable, and invalid UI states are rendered', () => {
    expect(dashboard).toContain('successfulPerformanceLoading');
    expect(dashboard).toContain('data-testid="sp-loading"');
    expect(dashboard).toContain("successfulPerformance?.status === 'unavailable'");
    expect(dashboard).toContain('data-testid="sp-unavailable"');
    expect(dashboard).toContain("successfulPerformance?.status === 'invalid'");
    expect(dashboard).toContain('data-testid="sp-invalid"');
  });

  test('does not merge Successful Performance into loadProfileRatingDashboardData', () => {
    const spEffectStart = dashboard.indexOf('void loadOwnSuccessfulPerformance(supabase)');
    const spEffectEnd = dashboard.indexOf('}, [isSelf]);', spEffectStart);
    const spEffect = dashboard.slice(spEffectStart, spEffectEnd);
    expect(spEffect).not.toContain('loadProfileRatingDashboardData');

    const dashboardEffectStart = dashboard.indexOf('void loadProfileRatingDashboardData(supabase');
    const dashboardEffectEnd = dashboard.indexOf('}, [profileUserId, isSelf]);', dashboardEffectStart);
    const dashboardEffect = dashboard.slice(dashboardEffectStart, dashboardEffectEnd);
    expect(dashboardEffect.toLowerCase()).not.toContain('successfulperformance');
    expect(dashboardEffect).not.toContain('get_own_successful_performance');

    const loader = src('lib/loadProfileRatingDashboard.ts');
    expect(loader.toLowerCase()).not.toContain('successfulperformance');
  });

  test('isSelf=false never invokes the RPC in dashboard source', () => {
    const selfBlock = dashboard.slice(
      dashboard.indexOf('if (!isSelf)'),
      dashboard.indexOf('void loadOwnSuccessfulPerformance'),
    );
    expect(selfBlock).toContain('setSuccessfulPerformance(null)');
    expect(selfBlock).not.toContain('loadOwnSuccessfulPerformance');
  });

  test('no exact-control Successful Performance rendering identifier is introduced', () => {
    expect(dashboard).not.toContain('exact_control');
    expect(dashboard).not.toContain('exact-control-successful-performance');
    expect(dashboard).not.toContain("kind: 'exact_control'");
  });

  test('no tournament-specific Successful Performance rendering identifier is introduced', () => {
    expect(dashboard).not.toContain('tournament-successful-performance');
    expect(dashboard).not.toContain("scope: 'tournament'");
    expect(dashboard).not.toContain('tournaments');
  });

  test('page.tsx and ProfileRatings.tsx remain unwired', () => {
    const profilePage = src('app/profile/[id]/page.tsx');
    const profileRatings = src('components/profile/ProfileRatings.tsx');
    expect(profilePage.toLowerCase()).not.toContain('successfulperformance');
    expect(profileRatings.toLowerCase()).not.toContain('successfulperformance');
  });
});
