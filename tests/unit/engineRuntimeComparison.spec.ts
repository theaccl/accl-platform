import { expect, test } from '@playwright/test';

import type { EngineAnalysisResult } from '@/lib/chess';
import {
  compareEngineCorpus,
  type EngineComparisonCorpus,
} from '@/services/stockfish-engine/src/comparison';

const corpus: EngineComparisonCorpus = {
  schemaVersion: 'accl.engine-comparison.1',
  cases: [
    {
      id: 'start-position',
      engineFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      limits: { depth: 8, multiPv: 1, timeoutMs: 5_000 },
    },
  ],
};

function result(version: string, move: string, cp: number): EngineAnalysisResult {
  return {
    identity: { name: 'stockfish', version },
    positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    engineFen: corpus.cases[0]!.engineFen,
    turn: 'w',
    pov: 'white',
    terminal: false,
    bestMove: move,
    lines: [{ rank: 1, move, pv: [move], score: { kind: 'cp', cp }, depth: 8, bound: null }],
    limits: corpus.cases[0]!.limits,
  };
}

test('comparison harness reuses canonical position and analysis contracts while allowing evaluator differences', async () => {
  const report = await compareEngineCorpus(
    corpus,
    async () => result('18-native', 'e2e4', 24),
    async () => result('18.0.7-lite', 'd2d4', 18)
  );

  expect(report.contractFailures).toEqual([]);
  expect(report.identities).toEqual({ native: '18-native', lite: '18.0.7-lite' });
  expect(report.centipawnDeltaSummary).toEqual({
    unit: 'native-minus-lite-cp',
    signed: { count: 1, min: 6, max: 6, mean: 6, p50: 6, p95: 6 },
    absolute: { count: 1, min: 6, max: 6, mean: 6, p50: 6, p95: 6 },
  });
  expect(report.cases[0]).toMatchObject({
    id: 'start-position',
    nativeBestMove: 'e2e4',
    liteBestMove: 'd2d4',
    nativeScore: 'cp:24',
    liteScore: 'cp:18',
    rankOneAgreement: false,
    differenceDisposition: 'REVIEW_REQUIRED',
  });
  expect(JSON.stringify(report)).not.toContain(corpus.cases[0]!.engineFen);
});

test('comparison harness marks unstable engine identity as a contract failure', async () => {
  const twoCases: EngineComparisonCorpus = { ...corpus, cases: [corpus.cases[0]!, { ...corpus.cases[0]!, id: 'second' }] };
  let calls = 0;
  const report = await compareEngineCorpus(
    twoCases,
    async () => result(++calls === 1 ? '18-native' : 'changed-native', 'e2e4', 1),
    async () => result('18-lite', 'e2e4', 1)
  );
  expect(report.contractFailures).toContain('second:native:unstable_identity');
});

test('comparison harness fails closed on illegal PV or score-perspective/schema drift', async () => {
  const broken = result('18-native', 'e2e5', 10);
  const report = await compareEngineCorpus(corpus, async () => broken, async () => result('18-lite', 'e2e4', 10));

  expect(report.contractFailures).toEqual(
    expect.arrayContaining([expect.stringContaining('start-position:native:analysis_contract')])
  );
});
