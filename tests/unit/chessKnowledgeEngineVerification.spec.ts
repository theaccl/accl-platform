import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyChessDataEngineVerificationReport } from '@/lib/chessKnowledge/engineVerificationReport';

test.describe('chess knowledge engine verification report shape', () => {
  test('empty report matches required safety invariants', () => {
    const r = emptyChessDataEngineVerificationReport('./data/staging/opening-puzzle-zips');
    expect(r.safety.production_mutations_attempted).toBe(false);
    expect(r.safety.db_writes_attempted).toBe(false);
    expect(r.openings.engine_checked).toBe(0);
    expect(r.puzzles.total).toBe(0);
  });

  test('verify-staged script exists and is referenced from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['chess-data:verify-staged']).toContain('verifyStagedChessData.mjs');
  });
});
