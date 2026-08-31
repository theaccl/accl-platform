import { expect, test } from '@playwright/test';

import type { EngineRuntimeEnvelope } from '@/lib/chess/runtime';
import { handleEngineHttpRequest } from '@/services/stockfish-engine/src/server';

function coordinator(
  envelope: EngineRuntimeEnvelope,
  snapshot: {
    accepting?: boolean;
    circuitOpenUntilMs?: number | null;
    workerState?: 'IDLE' | 'LEASED' | 'RESETTING' | 'RETIRING' | 'TERMINATED';
    shuttingDown?: boolean;
    requiresResidentMemoryMeasurement?: boolean;
    workers?: Array<{ id: string; state: string; completedSearches: number; residentMemoryBytes: number | null }>;
  } = {}
) {
  const accepting = snapshot.accepting ?? true;
  const workerState = snapshot.workerState ?? 'IDLE';
  return {
    async evaluate() {
      return envelope;
    },
    snapshot() {
      return {
        scheduler: {
          accepting: true,
          waiting: 0,
          waitingByLane: {
            BOT_LIVE: 0,
            TRAINER_INTERACTIVE: 0,
            PROTECTED_REVIEW: 0,
            POST_GAME_BATCH: 0,
          },
          running: 0,
          runningBatch: 0,
        },
        pool: {
          accepting,
          requiresResidentMemoryMeasurement: snapshot.requiresResidentMemoryMeasurement ?? false,
          circuitOpenUntilMs: snapshot.circuitOpenUntilMs ?? null,
          workers:
            snapshot.workers ??
            (accepting
              ? [
                  {
                    id: 'redacted-in-probe-1',
                    state: workerState,
                    completedSearches: 0,
                    residentMemoryBytes: 1,
                  },
                  {
                    id: 'redacted-in-probe-2',
                    state: workerState,
                    completedSearches: 0,
                    residentMemoryBytes: 1,
                  },
                ]
              : []),
        },
        runningRequests: 0,
        shuttingDown: snapshot.shuttingDown ?? false,
      };
    },
  };
}

test('HTTP failure mapping is typed, retryable, and contains no request data', async () => {
  const response = await handleEngineHttpRequest(
    coordinator({
      ok: false,
      error: { code: 'ENGINE_OVERLOADED', retryable: true },
    }),
    {
      method: 'POST',
      path: '/v1/evaluate',
      body: { engineFen: 'secret-fen-that-must-not-echo' },
    }
  );

  expect(response).toEqual({
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '1',
    },
    body: { ok: false, error: { code: 'ENGINE_OVERLOADED', retryable: true } },
  });
  expect(JSON.stringify(response)).not.toContain('secret-fen');
});

test('HTTP boundary rejects an internally malformed success envelope', async () => {
  const response = await handleEngineHttpRequest(
    coordinator({
      ok: true,
      result: {
        positionKey: 'contradictory-key',
        engineFen: 'not-a-fen',
        turn: 'w',
        pov: 'white',
        terminal: false,
        bestMove: null,
        identity: { name: 'stockfish', version: '18' },
        limits: { depth: 1, multiPv: 1, timeoutMs: 1_000 },
        lines: [],
      },
    }),
    { method: 'POST', path: '/v1/evaluate', body: {} }
  );

  expect(response).toEqual({
    status: 502,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: { ok: false, error: { code: 'ENGINE_PROTOCOL_ERROR', retryable: false } },
  });
});

test('probe endpoints are coarse and readiness fails closed', async () => {
  const unavailable = { ok: false as const, error: { code: 'ENGINE_POOL_UNAVAILABLE' as const, retryable: true } };
  await expect(
    handleEngineHttpRequest(coordinator(unavailable), { method: 'GET', path: '/healthz/live' })
  ).resolves.toMatchObject({ status: 200, body: { ok: true } });

  await expect(
    handleEngineHttpRequest(coordinator(unavailable, { accepting: false, shuttingDown: true, workers: [] }), {
      method: 'GET',
      path: '/healthz/ready',
    })
  ).resolves.toMatchObject({ status: 503, body: { ok: false } });
});

test('readiness requires accepting pool, closed circuit, usable worker, and no shutdown', async () => {
  const unavailable = { ok: false as const, error: { code: 'ENGINE_POOL_UNAVAILABLE' as const, retryable: true } };
  const ready = { method: 'GET' as const, path: '/healthz/ready' };

  await expect(handleEngineHttpRequest(coordinator(unavailable, { workerState: 'IDLE' }), ready)).resolves.toMatchObject({
    status: 200,
    body: { ok: true },
  });
  await expect(handleEngineHttpRequest(coordinator(unavailable, { workerState: 'LEASED' }), ready)).resolves.toMatchObject({
    status: 200,
    body: { ok: true },
  });
  await expect(
    handleEngineHttpRequest(coordinator(unavailable, { workerState: 'RESETTING' }), ready)
  ).resolves.toMatchObject({ status: 200, body: { ok: true } });
  await expect(
    handleEngineHttpRequest(coordinator(unavailable, { accepting: false, workerState: 'IDLE' }), ready)
  ).resolves.toMatchObject({ status: 503, body: { ok: false } });
  await expect(
    handleEngineHttpRequest(coordinator(unavailable, { circuitOpenUntilMs: 99_000, workerState: 'IDLE' }), ready)
  ).resolves.toMatchObject({ status: 503, body: { ok: false } });
  await expect(
    handleEngineHttpRequest(coordinator(unavailable, { workerState: 'RETIRING' }), ready)
  ).resolves.toMatchObject({ status: 503, body: { ok: false } });
  await expect(
    handleEngineHttpRequest(
      coordinator(unavailable, {
        requiresResidentMemoryMeasurement: true,
        workers: [
          { id: 'one', state: 'IDLE', completedSearches: 0, residentMemoryBytes: null },
          { id: 'two', state: 'IDLE', completedSearches: 0, residentMemoryBytes: null },
        ],
      }),
      ready
    )
  ).resolves.toMatchObject({ status: 503, body: { ok: false } });
  await expect(
    handleEngineHttpRequest(
      coordinator(unavailable, {
        workers: [{ id: 'only-one', state: 'IDLE', completedSearches: 0, residentMemoryBytes: 1 }],
      }),
      ready
    )
  ).resolves.toMatchObject({ status: 503, body: { ok: false } });
  await expect(
    handleEngineHttpRequest(coordinator(unavailable, { shuttingDown: true, workerState: 'IDLE' }), ready)
  ).resolves.toMatchObject({ status: 503, body: { ok: false } });
  await expect(
    handleEngineHttpRequest(coordinator(unavailable, { circuitOpenUntilMs: 99_000, workerState: 'IDLE' }), {
      method: 'GET',
      path: '/healthz/live',
    })
  ).resolves.toMatchObject({ status: 200, body: { ok: true } });
});
