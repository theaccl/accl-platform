import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyChessDataDryRunReport } from '@/lib/chessKnowledge/dryRunReport';

test.describe('chess knowledge dry-run report shape', () => {
  test('empty report matches required safety invariants', () => {
    const r = emptyChessDataDryRunReport();
    expect(r.safety.production_mutations_attempted).toBe(false);
    expect(r.safety.generic_chess_knowledge_table_detected).toBe(false);
    expect(r.openings.tournament_eligible).toBe(0);
    expect(r.puzzles.candidate_count).toBe(0);
  });

  test('dry-run script exists and is referenced from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['chess-data:dry-run']).toContain('dryRunImport.mjs');
  });
});
