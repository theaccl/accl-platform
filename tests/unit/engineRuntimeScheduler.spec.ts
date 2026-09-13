import { expect, test } from '@playwright/test';

import {
  ENGINE_RUNTIME_REQUEST_SCHEMA,
  clampEngineRuntimeRequest,
  parseEngineRuntimeRequest,
  type ApprovedRuntimeRequest,
  type EngineRuntimeLane,
} from '@/lib/chess/runtime';
import { EngineRuntimeScheduler } from '@/services/stockfish-engine/src/scheduler';
import type { SchedulerRejected } from '@/services/stockfish-engine/src/scheduler';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ignoreExpired = () => {};

function request(
  correlationId: string,
  lane: EngineRuntimeLane,
  timeoutMs = 1_000,
  remainingBudgetMs = 20_000
): ApprovedRuntimeRequest {
  return clampEngineRuntimeRequest(
    parseEngineRuntimeRequest({
      schemaVersion: ENGINE_RUNTIME_REQUEST_SCHEMA,
      correlationId,
      engineFen: START_FEN,
      lane,
      limits: { depth: 8, multiPv: 1, timeoutMs },
      remainingBudgetMs,
    })
  );
}

test('scheduler enforces lane and aggregate waiting caps', () => {
  const scheduler = new EngineRuntimeScheduler<string>();
  for (let index = 0; index < 4; index += 1) {
    expect(scheduler.admit(request(`bot-${index}`, 'BOT_LIVE'), 'bot', 0).ok).toBe(true);
  }
  const laneOverflow = scheduler.admit(request('bot-over', 'BOT_LIVE'), 'bot', 0);
  expect(laneOverflow).toMatchObject({
    ok: false,
    rejection: { code: 'ENGINE_OVERLOADED' },
  });

  for (let index = 0; index < 4; index += 1) {
    expect(
      scheduler.admit(request(`trainer-${index}`, 'TRAINER_INTERACTIVE'), 'trainer', 0).ok
    ).toBe(true);
  }
  expect(scheduler.snapshot().waiting).toBe(8);
  expect(
    scheduler.admit(request('protected-over', 'PROTECTED_REVIEW'), 'protected', 0)
  ).toMatchObject({ ok: false, rejection: { code: 'ENGINE_OVERLOADED' } });
});

test('batch work never occupies both workers and release is exactly once', () => {
  const scheduler = new EngineRuntimeScheduler<string>();
  scheduler.admit(request('protected', 'PROTECTED_REVIEW'), 'protected', 0);
  scheduler.admit(request('post', 'POST_GAME_BATCH'), 'post', 0);
  scheduler.admit(request('bot', 'BOT_LIVE'), 'bot', 0);

  const first = scheduler.dispatch(1, ignoreExpired);
  const second = scheduler.dispatch(1, ignoreExpired);
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(scheduler.snapshot()).toMatchObject({ running: 2, runningBatch: 1 });

  expect(first?.release()).toBe(true);
  expect(first?.release()).toBe(false);
  expect(second?.release()).toBe(true);
  expect(scheduler.snapshot()).toMatchObject({ running: 0, runningBatch: 0 });
});

test('weighted deficit scheduler is deterministic and FIFO within bounded queued work', () => {
  const scheduler = new EngineRuntimeScheduler<string>();
  const order: EngineRuntimeLane[] = [];
  const lanes: EngineRuntimeLane[] = [
    'BOT_LIVE',
    'BOT_LIVE',
    'BOT_LIVE',
    'BOT_LIVE',
    'TRAINER_INTERACTIVE',
    'TRAINER_INTERACTIVE',
    'PROTECTED_REVIEW',
    'POST_GAME_BATCH',
  ];
  lanes.forEach((lane, index) => {
    expect(scheduler.admit(request(`seed-${index}`, lane), lane, 0).ok).toBe(true);
  });

  while (scheduler.snapshot().waiting > 0) {
    const index = order.length;
    const item = scheduler.dispatch(index + 1, ignoreExpired);
    expect(item).not.toBeNull();
    if (!item) break;
    order.push(item.request.lane);
    item.release();
  }

  expect(order).toEqual([
    'BOT_LIVE',
    'BOT_LIVE',
    'BOT_LIVE',
    'BOT_LIVE',
    'TRAINER_INTERACTIVE',
    'TRAINER_INTERACTIVE',
    'PROTECTED_REVIEW',
    'POST_GAME_BATCH',
  ]);
});

test('continuous bot traffic cannot starve an admitted batch request', () => {
  const scheduler = new EngineRuntimeScheduler<string>();
  for (let index = 0; index < 4; index += 1) {
    scheduler.admit(request(`bot-seed-${index}`, 'BOT_LIVE'), 'bot', 0);
  }
  scheduler.admit(request('post', 'POST_GAME_BATCH'), 'post', 0);

  const order: EngineRuntimeLane[] = [];
  for (let index = 0; index < 12 && !order.includes('POST_GAME_BATCH'); index += 1) {
    const item = scheduler.dispatch(index + 1, ignoreExpired);
    expect(item).not.toBeNull();
    if (!item) break;
    order.push(item.request.lane);
    item.release();
    if (item.request.lane === 'BOT_LIVE') {
      scheduler.admit(request(`bot-refill-${index}`, 'BOT_LIVE'), 'bot', index + 1);
    }
  }

  expect(order.at(-1)).toBe('POST_GAME_BATCH');
  expect(order.length).toBeLessThanOrEqual(9);
});

test('queue, total timeout, cancellation, and shutdown settlements are distinct', () => {
  const scheduler = new EngineRuntimeScheduler<string>();
  scheduler.admit(request('queue', 'BOT_LIVE', 1_000, 10_000), 'queue', 0);
  expect(scheduler.expire(251)).toMatchObject([{ code: 'ENGINE_QUEUE_TIMEOUT' }]);

  scheduler.admit(request('total', 'BOT_LIVE', 1_000, 100), 'total', 1_000);
  expect(scheduler.expire(1_100)).toMatchObject([{ code: 'ENGINE_TOTAL_TIMEOUT' }]);

  scheduler.admit(request('cancel', 'TRAINER_INTERACTIVE'), 'cancel', 2_000);
  expect(scheduler.cancel('cancel')).toMatchObject({ code: 'ENGINE_REQUEST_CANCELLED' });

  scheduler.admit(request('shutdown', 'POST_GAME_BATCH'), 'shutdown', 3_000);
  expect(scheduler.stopAccepting()).toMatchObject([{ code: 'ENGINE_POOL_UNAVAILABLE' }]);
  expect(scheduler.admit(request('late', 'BOT_LIVE'), 'late', 3_001)).toMatchObject({
    ok: false,
    rejection: { code: 'ENGINE_POOL_UNAVAILABLE' },
  });
});

test('dispatch reports each request that expires during dispatch exactly once', () => {
  const scheduler = new EngineRuntimeScheduler<string>();
  const settled: SchedulerRejected<string>[] = [];
  scheduler.admit(request('dispatch-expired', 'BOT_LIVE', 1_000, 10_000), 'pending', 0);

  expect(scheduler.dispatch(251, (rejection) => settled.push(rejection))).toBeNull();
  expect(settled).toMatchObject([
    { value: 'pending', code: 'ENGINE_QUEUE_TIMEOUT' },
  ]);

  expect(scheduler.dispatch(500, (rejection) => settled.push(rejection))).toBeNull();
  expect(scheduler.cancel('dispatch-expired')).toBeNull();
  expect(settled).toHaveLength(1);
});
