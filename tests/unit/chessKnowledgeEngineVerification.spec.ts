import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertHonestEngineProvenance,
  emptyEngineProvenance,
} from '@/lib/chessKnowledge/engineProvenance';
import {
  emptyChessDataEngineVerificationReport,
  notRunEngineProvenance,
} from '@/lib/chessKnowledge/engineVerificationReport';

test.describe('chess knowledge engine verification report shape', () => {
  test('empty report matches required safety invariants', () => {
    const r = emptyChessDataEngineVerificationReport('./data/staging/opening-puzzle-zips');
    expect(r.safety.production_mutations_attempted).toBe(false);
    expect(r.safety.db_writes_attempted).toBe(false);
    expect(r.openings.engine_checked).toBe(0);
    expect(r.puzzles.total).toBe(0);
  });

  test('not-run provenance does not claim engine verification', () => {
    const p = notRunEngineProvenance('legal_moves_validated');
    expect(p.engine_name).toBeNull();
    expect(p.engine_version).toBeNull();
    expect(p.score_value).toBeNull();
    expect(p.verified_at).toBeNull();
    expect(p.unavailable_reason).toBe('engine_verification_not_run');
    expect(assertHonestEngineProvenance(p).ok).toBe(true);
  });

  test('configured parameters alone cannot claim engine_verified', () => {
    const configuredOnly = {
      ...emptyEngineProvenance('engine_verified', null),
      depth: 10,
      multipv: 3,
      engine_name: null,
      verified_at: null,
    };
    expect(assertHonestEngineProvenance(configuredOnly).ok).toBe(false);
  });

  test('verify-staged script exists and is referenced from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['chess-data:verify-staged']).toContain('verifyStagedChessData.mjs');
  });

  test('puzzle seed samples include honest not-run engine provenance', () => {
    const seeds = JSON.parse(
      readFileSync(
        join(process.cwd(), 'data/staging/opening-puzzle-zips/puzzles/puzzle-candidates-seed-sample.json'),
        'utf8'
      )
    ) as Array<{ engine_verified: boolean; engine_provenance: { verification_status: string; engine_version: string | null; verified_at: string | null } }>;
    expect(seeds.length).toBeGreaterThan(0);
    for (const row of seeds) {
      expect(row.engine_verified).toBe(false);
      expect(row.engine_provenance.verification_status).toBe('legal_moves_validated');
      expect(row.engine_provenance.engine_version).toBeNull();
      expect(row.engine_provenance.verified_at).toBeNull();
    }
  });
});
