import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { PINNED_STOCKFISH_IDENTITY, evaluatePositionWithStockfish } from '@/lib/chess';
import {
  compareEngineCorpus,
  type EngineComparisonCorpus,
  type ComparisonEvaluator,
} from '@/services/stockfish-engine/src/comparison';
import { STOCKFISH_FULL_NATIVE_IDENTITY } from '@/services/stockfish-engine/src/stockfishExecutor';
import { StockfishProcess } from '@/services/stockfish-engine/src/stockfishProcess';
import {
  STOCKFISH_BIG_NNUE_SHA256,
  STOCKFISH_SMALL_NNUE_SHA256,
  STOCKFISH_UPSTREAM_COMMIT,
} from '@/services/stockfish-engine/src/config';

const authorized = process.env.ACCL_RUN_REAL_ENGINE_COMPARISON === '1';
const ACCEPTED_LITE_JS_SHA256 = '2c02445abf3a13af1c5cb5a2be80ef0d62c3b3e1903823a10b7d6ddb87a94a15';
const ACCEPTED_LITE_WASM_SHA256 = 'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1';
const ACCEPTED_LITE_NNUE_SHA256 = '9067e33176e8c5edb7aa8db6a3aedd012f84a1f39872e86357c6c2d0993f314d';

test('authorized fixed-corpus native-versus-Lite comparison', async () => {
  test.skip(!authorized, 'real engine searches require explicit authorization');
  test.setTimeout(240_000);
  const nativePath = process.env.ACCL_NATIVE_STOCKFISH_PATH;
  const nativeSha256 = process.env.ACCL_NATIVE_STOCKFISH_SHA256;
  const reportPath = process.env.ACCL_ENGINE_COMPARISON_REPORT_PATH;
  if (!nativePath || !nativeSha256 || !reportPath) throw new Error('comparison_environment_incomplete');

  const litePath = path.resolve(process.cwd(), 'public/stockfish/stockfish-18-lite-single.js');
  const liteWasmPath = path.resolve(process.cwd(), 'public/stockfish/stockfish-18-lite-single.wasm');
  const nodeSha256 = createHash('sha256').update(await readFile(process.execPath)).digest('hex');
  const liteJavaScriptSha256 = createHash('sha256').update(await readFile(litePath)).digest('hex');
  const liteWasmSha256 = createHash('sha256').update(await readFile(liteWasmPath)).digest('hex');
  expect(liteJavaScriptSha256).toBe(ACCEPTED_LITE_JS_SHA256);
  expect(liteWasmSha256).toBe(ACCEPTED_LITE_WASM_SHA256);
  const corpus = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'tests/fixtures/stockfishComparisonCorpus.v1.json'), 'utf8')
  ) as EngineComparisonCorpus;

  const native = new StockfishProcess({
    id: 'comparison-native', executablePath: nativePath, executableSha256: nativeSha256,
    expectedUciName: 'Stockfish 18', expectedBigNetwork: 'nn-c288c895ea92.nnue',
    expectedSmallNetwork: 'nn-37f18f62d772.nnue',
  });
  const lite = new StockfishProcess({
    id: 'comparison-lite', executablePath: process.execPath, executableSha256: nodeSha256,
    executableArgs: [litePath], expectedUciName: 'Stockfish 18 Lite WASM',
    expectedBigNetwork: 'nn-9067e33176e8.nnue',
  });
  await Promise.all([native.warm(), lite.warm()]);

  const evaluator = (worker: StockfishProcess, identity: typeof PINNED_STOCKFISH_IDENTITY): ComparisonEvaluator =>
    async ({ position, limits }) => {
      const transport = await worker.prepareLease();
      try {
        return await evaluatePositionWithStockfish({ transport, position, limits, identity });
      } finally {
        await worker.resetAfterLease();
      }
    };

  try {
    const report = await compareEngineCorpus(
      corpus,
      evaluator(native, STOCKFISH_FULL_NATIVE_IDENTITY),
      evaluator(lite, PINNED_STOCKFISH_IDENTITY),
      {
        nativeBinarySha256: nativeSha256,
        liteJavaScriptSha256,
        liteWasmSha256,
        nativeUpstreamCommit: STOCKFISH_UPSTREAM_COMMIT,
        nativeBigNnueSha256: STOCKFISH_BIG_NNUE_SHA256,
        nativeSmallNnueSha256: STOCKFISH_SMALL_NNUE_SHA256,
        liteNnueSha256: ACCEPTED_LITE_NNUE_SHA256,
        liteWrapperVersion: '18.0.7',
      }
    );
    expect(report.contractFailures).toEqual([]);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  } finally {
    await Promise.allSettled([native.terminate(), lite.terminate()]);
  }
});
