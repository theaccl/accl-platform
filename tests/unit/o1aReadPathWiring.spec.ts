import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { overallEloFromP1 } from '../../lib/profile';
import { ratingFromPlayerRatingsMap } from '../../lib/p1PublicRatingRead';
import type { PublicP1Read } from '../../lib/p1PublicRatingRead';

const ROOT = join(process.cwd());

test.describe('O1-A read-path wiring', () => {
  test('ratingFromPlayerRatingsMap does not fallback accl to tournament_unified', () => {
    const byUser = new Map<string, Map<string, number>>([
      ['u1', new Map([['tournament_unified', 1620]])],
    ]);
    const rating = ratingFromPlayerRatingsMap(
      byUser,
      'u1',
      'free',
      'live',
      '5m',
      null,
    );
    expect(rating).toBeNull();
  });

  test('ratingFromPlayerRatingsMap uses accl_overall for non-tournament bucket miss', () => {
    const byUser = new Map<string, Map<string, number>>([
      ['u1', new Map([['accl_overall', 1500], ['tournament_unified', 1620]])],
    ]);
    const rating = ratingFromPlayerRatingsMap(
      byUser,
      'u1',
      'free',
      'live',
      '5m',
      null,
    );
    expect(rating).toBe(1500);
  });

  test('ratingFromPlayerRatingsMap tournament context does not use accl_overall', () => {
    const byUser = new Map<string, Map<string, number>>([
      ['u1', new Map([['accl_overall', 1500]])],
    ]);
    const rating = ratingFromPlayerRatingsMap(
      byUser,
      'u1',
      'tournament',
      'live',
      '5m',
      null,
    );
    expect(rating).toBeNull();
  });

  test('overallEloFromP1 tournament_elo does not use accl_rating', () => {
    const p1: PublicP1Read = {
      accl_rating: 1500,
      accl_overall: { rating: 1500, games_played: 0 },
      tournament_rating: null,
      tournament_unified: null,
      free_bullet: { rating: 1200, games_played: 0 },
      free_blitz: { rating: 1300, games_played: 0 },
      free_rapid: { rating: 1400, games_played: 0 },
      free_day: { rating: 1500, games_played: 0 },
    };
    expect(overallEloFromP1(p1)).toBe(1350);
  });

  test('getLiveGames fetch includes accl_overall bucket', () => {
    const src = readFileSync(join(ROOT, 'lib/nexus/getLiveGames.ts'), 'utf8');
    expect(src).toContain("'accl_overall'");
    expect(src).toMatch(/p1Buckets[\s\S]*accl_overall[\s\S]*tournament_unified/);
  });

  test('PublicIdentityCard uses ACCL Overall and Tournament labels', () => {
    const src = readFileSync(join(ROOT, 'components/identity/PublicIdentityCard.tsx'), 'utf8');
    expect(src).toContain('"ACCL Overall"');
    expect(src).toContain('"Tournament"');
    expect(src).not.toContain('Tournament (ACCL)');
  });

  test('O1-A does not modify apply_free_play_rating_update_core', () => {
    const implFiles = [
      'lib/ratingHistoryLedgerBuild.ts',
      'lib/profileRatingHistoryBuild.ts',
      'lib/p1PublicRatingRead.ts',
      'lib/nexus/getLiveGames.ts',
      'lib/profile.ts',
      'components/identity/PublicIdentityCard.tsx',
      'lib/p1RatingsSpec.ts',
    ];
    for (const rel of implFiles) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src).not.toContain('apply_free_play_rating_update_core');
    }
  });

  test('O1-A changes do not write player_badge_state', () => {
    const files = [
      'lib/ratingHistoryLedgerBuild.ts',
      'lib/profileRatingHistoryBuild.ts',
      'lib/p1PublicRatingRead.ts',
      'lib/nexus/getLiveGames.ts',
      'lib/profile.ts',
    ];
    for (const rel of files) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src).not.toMatch(/insert into public\.player_badge_state/i);
      expect(src).not.toMatch(/update public\.player_badge_state/i);
    }
  });

  test('O1-A does not create new migrations', () => {
    const dir = join(ROOT, 'supabase/migrations');
    const o1Baseline = '20260621160000_accl_overall_o1_bucket_foundation_snapshot_separation.sql';
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && f > o1Baseline);
    expect(files).toHaveLength(0);
  });
});
