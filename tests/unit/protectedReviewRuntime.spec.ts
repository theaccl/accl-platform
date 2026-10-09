import { expect, test } from '@playwright/test';

import { parsePosition, PINNED_STOCKFISH_IDENTITY, type EngineAnalysisResult } from '../../lib/chess';
import {
  ENGINE_RUNTIME_LANE_POLICIES,
  EngineRuntimeRemoteError,
  runtimeFailureEnvelope,
  type EngineRuntimeClient,
  type EngineRuntimeRequest,
} from '../../lib/chess/runtime';
import {
  ProtectedReviewRuntimeDisabledError,
  getProtectedReviewRuntimeTruth,
} from '../../lib/analysis/protectedReviewRuntime.server';

const REVIEW_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

function resultFor(fen: string): EngineAnalysisResult {
  const position = parsePosition(fen);
  const move = position.legalUciMoves[0]!;
  return {
    identity: PINNED_STOCKFISH_IDENTITY,
    positionKey: position.positionKey,
    engineFen: position.engineFen,
    turn: position.turn,
    pov: 'white',
    terminal: false,
    bestMove: move,
    lines: [
      {
        rank: 1,
        move,
        pv: [move],
        score: { kind: 'cp', cp: 31 },
        depth: 12,
        bound: null,
      },
    ],
    limits: { depth: 12, multiPv: 2, timeoutMs: 9_000 },
  };
}

test('protected review runtime is dormant unless the private server flag is exactly true', async () => {
  let called = false;
  const client = {
    evaluate: async () => {
      called = true;
      return resultFor(REVIEW_FEN);
    },
  } as Pick<EngineRuntimeClient, 'evaluate'>;

  await expect(
    getProtectedReviewRuntimeTruth({
      actorScope: 'local-only-scope',
      fen: REVIEW_FEN,
      mode: 'analyst',
      moves: [{ san: 'e4' }],
      client,
      env: { ENGINE_PROTECTED_REVIEW_RUNTIME_ENABLED: 'TRUE' },
    })
  ).rejects.toBeInstanceOf(ProtectedReviewRuntimeDisabledError);
  expect(called).toBe(false);
});

test('protected review sends only the locked request contract and keeps actor scope local', async () => {
  let captured:
    | { actorScope: string; request: EngineRuntimeRequest; signal?: AbortSignal }
    | undefined;
  const client = {
    evaluate: async (input: {
      actorScope: string;
      request: EngineRuntimeRequest;
      signal?: AbortSignal;
    }) => {
      captured = input;
      return resultFor(input.request.engineFen);
    },
  } as Pick<EngineRuntimeClient, 'evaluate'>;

  const truth = await getProtectedReviewRuntimeTruth({
    actorScope: 'user/game scope must remain local',
    fen: REVIEW_FEN,
    mode: 'analyst',
    moves: [{ san: 'e4' }, { san: 'e5' }],
    client,
      env: { ENGINE_PROTECTED_REVIEW_RUNTIME_ENABLED: 'true' },
      correlationIdFactory: () => 'review-random-correlation',
      observe: () => {},
  });

  expect(captured?.actorScope).toBe('user/game scope must remain local');
  expect(captured?.request).toEqual({
    schemaVersion: 'accl.engine.runtime.request.1',
    correlationId: 'review-random-correlation',
    engineFen: parsePosition(REVIEW_FEN).engineFen,
    lane: 'PROTECTED_REVIEW',
    limits: { depth: 12, multiPv: 2, timeoutMs: 9_000 },
    remainingBudgetMs: ENGINE_RUNTIME_LANE_POLICIES.PROTECTED_REVIEW.totalCeilingMs,
  });
  expect(Object.keys(captured?.request ?? {}).sort()).toEqual(
    ['correlationId', 'engineFen', 'lane', 'limits', 'remainingBudgetMs', 'schemaVersion'].sort()
  );
  expect(truth.rows).toHaveLength(2);
  expect(truth.rows.every((row) => row.analyzerType === 'engine')).toBe(true);
  expect(truth.rows.every((row) => row.engineScore === undefined)).toBe(true);
});

test('caller cancellation is forwarded and typed runtime failures are preserved', async () => {
  const controller = new AbortController();
  const failure = new EngineRuntimeRemoteError(runtimeFailureEnvelope('ENGINE_QUEUE_TIMEOUT'));
  const client = {
    evaluate: async (input: { signal?: AbortSignal }) => {
      expect(input.signal).toBe(controller.signal);
      throw failure;
    },
  } as Pick<EngineRuntimeClient, 'evaluate'>;

  await expect(
    getProtectedReviewRuntimeTruth({
      actorScope: 'local-only-scope',
      fen: REVIEW_FEN,
      mode: 'coach',
      moves: [{ san: 'e4' }],
      signal: controller.signal,
      client,
      env: { ENGINE_PROTECTED_REVIEW_RUNTIME_ENABLED: 'true' },
      observe: () => {},
    })
  ).rejects.toBe(failure);
});

test('a valid response for a different position fails closed as a protocol error', async () => {
  const client = {
    evaluate: async () => resultFor('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
  } as Pick<EngineRuntimeClient, 'evaluate'>;

  const error = await getProtectedReviewRuntimeTruth({
    actorScope: 'local-only-scope',
    fen: REVIEW_FEN,
    mode: 'coach',
    moves: [{ san: 'e4' }],
    client,
    env: { ENGINE_PROTECTED_REVIEW_RUNTIME_ENABLED: 'true' },
    observe: () => {},
  }).catch((value: unknown) => value);

  expect(error).toBeInstanceOf(EngineRuntimeRemoteError);
  expect((error as EngineRuntimeRemoteError).envelope.error.code).toBe('ENGINE_PROTOCOL_ERROR');
});

test('explainer mode remains local and does not require runtime activation', async () => {
  let called = false;
  const client = {
    evaluate: async () => {
      called = true;
      return resultFor(REVIEW_FEN);
    },
  } as Pick<EngineRuntimeClient, 'evaluate'>;

  const truth = await getProtectedReviewRuntimeTruth({
    actorScope: 'local-only-scope',
    fen: REVIEW_FEN,
    mode: 'explainer',
    moves: [{ san: 'e4' }],
    client,
    env: {},
  });

  expect(called).toBe(false);
  expect(truth.rows[0]?.analyzerType).toBe('heuristic');
});
