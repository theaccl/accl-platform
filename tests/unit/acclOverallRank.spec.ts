import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ACCL_OVERALL_RANK_TIERS,
  ACCL_OVERALL_RANK_UNRANKED_LABEL,
  acclOverallRankDisplayLabel,
  acclOverallRankForRating,
  acclOverallRankLabelForLane,
} from '../../lib/profile/acclOverallRank';

/** Expected tier label at each requested boundary rating. */
const BOUNDARY_LABELS: Array<[number, string]> = [
  [600, 'F'],
  [999, 'F'],
  [1000, 'E'],
  [1199, 'E'],
  [1200, 'D'],
  [1399, 'D'],
  [1400, 'C'],
  [1599, 'C'],
  [1600, 'B'],
  [1799, 'B'],
  [1800, 'A'],
  [1999, 'A'],
  [2000, 'Expert'],
  [2199, 'Expert'],
  [2200, 'Battle Master'],
  [2399, 'Battle Master'],
  [2400, 'High Master'],
  [2599, 'High Master'],
  [2600, 'Apex Master'],
  [2799, 'Apex Master'],
  [2800, 'Sovereign Master'],
  [2999, 'Sovereign Master'],
  [3000, 'Platinum Sovereign'],
  [3199, 'Platinum Sovereign'],
  [3200, 'Diamond Sovereign'],
  [3399, 'Diamond Sovereign'],
  [3400, 'Eternal Sovereign'],
  [3599, 'Eternal Sovereign'],
  [3600, 'Sovereign Eternal'],
  [3601, 'Sovereign Eternal'],
  [999999, 'Sovereign Eternal'],
];

test.describe('acclOverallRankForRating — boundaries', () => {
  test('null/undefined/NaN are unavailable', () => {
    expect(acclOverallRankForRating(null).status).toBe('unavailable');
    expect(acclOverallRankForRating(undefined).status).toBe('unavailable');
    expect(acclOverallRankForRating(Number.NaN).status).toBe('unavailable');
    expect(acclOverallRankForRating(Number.POSITIVE_INFINITY).status).toBe('unavailable');
    expect(acclOverallRankDisplayLabel(null)).toBeNull();
  });

  test('599 is below the ladder floor (unranked)', () => {
    const r = acclOverallRankForRating(599);
    expect(r.status).toBe('below_ladder');
    expect(acclOverallRankDisplayLabel(599)).toBe(ACCL_OVERALL_RANK_UNRANKED_LABEL);
  });

  for (const [rating, label] of BOUNDARY_LABELS) {
    test(`rating ${rating} → ${label}`, () => {
      const r = acclOverallRankForRating(rating);
      expect(r.status).toBe('ranked');
      if (r.status === 'ranked') {
        expect(r.tier.label).toBe(label);
      }
      expect(acclOverallRankDisplayLabel(rating)).toBe(label);
    });
  }

  test('open-ended top tier has null upper bound only for Sovereign Eternal', () => {
    const openTiers = ACCL_OVERALL_RANK_TIERS.filter((t) => t.upperBound === null);
    expect(openTiers).toHaveLength(1);
    expect(openTiers[0]?.id).toBe('sovereign_eternal');
    expect(openTiers[0]?.lowerBound).toBe(3600);
  });

  test('ladder is contiguous and lower/upper inclusive', () => {
    for (let i = 0; i < ACCL_OVERALL_RANK_TIERS.length - 1; i += 1) {
      const cur = ACCL_OVERALL_RANK_TIERS[i];
      const next = ACCL_OVERALL_RANK_TIERS[i + 1];
      expect(cur.upperBound).not.toBeNull();
      expect((cur.upperBound as number) + 1).toBe(next.lowerBound);
    }
  });

  test('explicit locked-ladder anchors', () => {
    expect(acclOverallRankDisplayLabel(1330)).toBe('D');
    expect(acclOverallRankDisplayLabel(2200)).toBe('Battle Master');
    expect(acclOverallRankDisplayLabel(2399)).toBe('Battle Master');
    expect(acclOverallRankDisplayLabel(2400)).toBe('High Master');
  });

  test('fractional input never grants an early higher tier (floor, never round/ceil)', () => {
    // 2399.x must stay Battle Master — must NOT become High Master (2400).
    expect(acclOverallRankDisplayLabel(2399.4)).toBe('Battle Master');
    expect(acclOverallRankDisplayLabel(2399.6)).toBe('Battle Master');
    expect(acclOverallRankDisplayLabel(2399.4)).not.toBe('High Master');
    expect(acclOverallRankDisplayLabel(2399.6)).not.toBe('High Master');
    // 3599.9 must stay Eternal Sovereign — must NOT become Sovereign Eternal (3600).
    expect(acclOverallRankDisplayLabel(3599.9)).toBe('Eternal Sovereign');
    expect(acclOverallRankDisplayLabel(3599.9)).not.toBe('Sovereign Eternal');
    // Exact 3600 integer is the open-ended top tier.
    expect(acclOverallRankDisplayLabel(3600)).toBe('Sovereign Eternal');
  });
});

test.describe('acclOverallRankLabelForLane — only ACCL Overall lane is labeled', () => {
  test('accl lane receives the rank label', () => {
    expect(acclOverallRankLabelForLane('accl', 2450)).toBe('High Master');
  });

  test('all other lanes return null even with a ratable value', () => {
    for (const lane of ['tournament', 'free_bullet', 'free_blitz', 'free_rapid', 'free_day']) {
      expect(acclOverallRankLabelForLane(lane, 2450)).toBeNull();
    }
  });
});

test.describe('acclOverallRank — isolation & regression guards', () => {
  const moduleSource = readFileSync(
    join(process.cwd(), 'lib/profile/acclOverallRank.ts'),
    'utf8',
  );
  /** Actual module dependencies only (module names may appear in doc comments intentionally). */
  const importLines = moduleSource
    .split('\n')
    .filter((l) => /^\s*import\b/.test(l) || /\brequire\s*\(/.test(l))
    .join('\n');

  test('has no runtime/module imports at all (fully self-contained)', () => {
    expect(importLines).toBe('');
  });

  test('never reads tournament_unified (no such token anywhere in the module)', () => {
    expect(moduleSource).not.toContain('tournament_unified');
  });

  test('does not import badge settlement or competitive-title systems', () => {
    for (const forbidden of [
      'badgeTracks',
      'badgeSettlement',
      'badgeSettlementRead',
      'profileBadgeBoundary',
      'titleAssignment',
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  test('does not import Supabase or API/network code', () => {
    expect(importLines.toLowerCase()).not.toContain('supabase');
    expect(moduleSource).not.toContain('@/lib/supabaseClient');
    expect(moduleSource).not.toContain('fetch(');
    expect(moduleSource).not.toMatch(/from ['"]@\/app\//);
  });

  test('dashboard wires the rank label only through the lane-scoped helper', () => {
    const dashboard = readFileSync(
      join(process.cwd(), 'components/profile/ratings/ProfileRatingsDashboard.tsx'),
      'utf8',
    );
    expect(dashboard).toContain('acclOverallRankLabelForLane(card.id, card.rating)');
  });
});
