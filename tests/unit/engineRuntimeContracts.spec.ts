import { expect, test } from '@playwright/test';

import {
  ENGINE_RUNTIME_REQUEST_SCHEMA,
  EngineRuntimeContractError,
  clampEngineRuntimeRequest,
  parseEngineRuntimeRequest,
  parseEngineRuntimeEnvelope,
  runtimeFailure,
  runtimeHttpStatus,
  runtimeRetryAfterSeconds,
} from '@/lib/chess/runtime';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('runtime request is exact and carries no asserted position key', () => {
  const request = parseEngineRuntimeRequest({
    schemaVersion: ENGINE_RUNTIME_REQUEST_SCHEMA,
    correlationId: 'corr-1',
    engineFen: START_FEN,
    lane: 'TRAINER_INTERACTIVE',
    limits: { depth: 12, multiPv: 3, timeoutMs: 20_000 },
    remainingBudgetMs: 99_000,
  });

  expect(request.correlationId).toBe('corr-1');
  expect(() =>
    parseEngineRuntimeRequest({ ...request, positionKey: 'caller-must-not-assert-this' })
  ).toThrow(EngineRuntimeContractError);
});

test('lane policy clamps search and total budgets independently', () => {
  const request = parseEngineRuntimeRequest({
    schemaVersion: ENGINE_RUNTIME_REQUEST_SCHEMA,
    correlationId: 'corr-bot',
    engineFen: START_FEN,
    lane: 'BOT_LIVE',
    limits: { depth: 999, multiPv: 999, timeoutMs: 99_000 },
    remainingBudgetMs: 99_000,
  });
  const approved = clampEngineRuntimeRequest(request);

  expect(approved.limits).toEqual({ depth: 24, multiPv: 8, timeoutMs: 12_000 });
  expect(approved.remainingBudgetMs).toBe(14_000);
});

test('typed failures have locked retry and HTTP semantics', () => {
  expect(runtimeFailure('ENGINE_OVERLOADED')).toEqual({
    code: 'ENGINE_OVERLOADED',
    retryable: true,
  });
  expect(runtimeFailure('ENGINE_PROTOCOL_ERROR')).toEqual({
    code: 'ENGINE_PROTOCOL_ERROR',
    retryable: false,
  });
  expect(runtimeHttpStatus('ENGINE_TOTAL_TIMEOUT')).toBe(504);
  expect(runtimeHttpStatus('ENGINE_REQUEST_CANCELLED')).toBe(499);
  expect(runtimeRetryAfterSeconds(-5)).toBe(1);
  expect(runtimeRetryAfterSeconds(9)).toBe(5);
});

test('success response validation rejects an asserted key that contradicts canonical FEN', () => {
  expect(() =>
    parseEngineRuntimeEnvelope({
      ok: true,
      result: {
        identity: { name: 'stockfish', version: 'test' },
        positionKey: 'forged-key',
        engineFen: START_FEN,
        turn: 'w',
        pov: 'white',
        terminal: false,
        bestMove: 'e2e4',
        lines: [
          {
            rank: 1,
            move: 'e2e4',
            pv: ['e2e4'],
            score: { kind: 'cp', cp: 10 },
            depth: 8,
            bound: null,
          },
        ],
        limits: { depth: 8, multiPv: 1, timeoutMs: 1_000 },
      },
    })
  ).toThrow(EngineRuntimeContractError);
});
