import { expect, test } from '@playwright/test';

import { EngineRuntimeTelemetry, EngineTelemetryExporter } from '@/services/stockfish-engine/src/observability';

test('telemetry keeps only bounded operational dimensions and fixed latency buckets', () => {
  const telemetry = new EngineRuntimeTelemetry({
    engineCommit: 'cb3d4ee9b47d0c5aae855b12379378ea1439675c',
    bigNnueSha256: 'c'.repeat(64),
    smallNnueSha256: '3'.repeat(64),
    imageDigest: 'sha256:' + 'a'.repeat(64),
    cloudRunRevision: 'accl-stockfish-engine-00001-test',
  });

  telemetry.setQueue('BOT_LIVE', 2, 249);
  telemetry.recordLatency('BOT_LIVE', 'queue', 249);
  telemetry.recordLatency('BOT_LIVE', 'search', 1_001);
  telemetry.recordLatency('BOT_LIVE', 'total', 1_250);
  telemetry.recordOutcome('BOT_LIVE', 'success');
  telemetry.recordPoolEvent('rss_recycle');
  telemetry.refreshPool({
    accepting: true,
    requiresResidentMemoryMeasurement: false,
    circuitOpenUntilMs: null,
    workers: [
      { id: 'unbounded-worker-id-1', state: 'IDLE', completedSearches: 1, residentMemoryBytes: 100 },
      { id: 'unbounded-worker-id-2', state: 'LEASED', completedSearches: 2, residentMemoryBytes: 200 },
    ],
  });

  const snapshot = telemetry.snapshot();
  expect(snapshot.queueDepthByLane.BOT_LIVE).toBe(2);
  expect(snapshot.latencies['BOT_LIVE:queue']).toMatchObject({ count: 1, sumMs: 249, maxMs: 249 });
  expect(snapshot.latencies['BOT_LIVE:queue']?.buckets['250']).toBe(1);
  expect(snapshot.outcomes['BOT_LIVE:success']).toBe(1);
  expect(snapshot.poolEvents.rss_recycle).toBe(1);
  expect(snapshot.workerStates).toMatchObject({ IDLE: 1, LEASED: 1 });
  expect(snapshot.processRss).toEqual({ measuredWorkers: 2, unavailableWorkers: 0, totalBytes: 300, maxBytes: 200 });
  expect(JSON.stringify(snapshot)).not.toContain('unbounded-worker-id');
});

test('structured telemetry never accepts request or chess payloads and reports unavailable RSS', () => {
  const telemetry = new EngineRuntimeTelemetry();
  telemetry.refreshPool({
    accepting: true,
    requiresResidentMemoryMeasurement: true,
    circuitOpenUntilMs: 123,
    workers: [
      { id: 'stockfish-1', state: 'RETIRING', completedSearches: 0, residentMemoryBytes: null },
    ],
  });

  const record = telemetry.structuredRecord();
  expect(record.event).toBe('accl_engine_runtime_metrics');
  expect(record.metrics.processRss.unavailableWorkers).toBe(1);
  expect(record.metrics.circuitOpen).toBe(true);
  expect(JSON.stringify(record)).not.toMatch(/fen|pgn|transcript|player|actor|token/i);
});

test('structured exporter refreshes before emission and stops its single timer', () => {
  const telemetry = new EngineRuntimeTelemetry();
  const records: string[] = [];
  let refreshes = 0;
  let callback: (() => void) | undefined;
  let cleared = false;
  const exporter = new EngineTelemetryExporter(telemetry, () => { refreshes += 1; }, {
    write: (record) => records.push(record),
    setInterval: ((next: () => void) => {
      callback = next;
      return { unref() {} } as NodeJS.Timeout;
    }) as typeof setInterval,
    clearInterval: (() => { cleared = true; }) as typeof clearInterval,
  });

  exporter.start();
  callback?.();
  exporter.stop();
  expect(refreshes).toBe(2);
  expect(records).toHaveLength(2);
  expect(records.every((record) => JSON.parse(record).event === 'accl_engine_runtime_metrics')).toBe(true);
  expect(cleared).toBe(true);
});

test('per-request log records expose only bounded dimensions needed for rolling latency alerts', () => {
  const records: string[] = [];
  const telemetry = new EngineRuntimeTelemetry({}, { emitEvent: (record) => records.push(record) });
  telemetry.recordLatency('BOT_LIVE', 'queue', 251.8);
  telemetry.recordOutcome('BOT_LIVE', 'ENGINE_OVERLOADED');
  telemetry.recordPoolEvent('circuit_open');

  expect(records.map((record) => JSON.parse(record))).toEqual([
    { event: 'accl_engine_latency', lane: 'BOT_LIVE', phase: 'queue', latencyMs: 251 },
    { event: 'accl_engine_outcome', lane: 'BOT_LIVE', outcome: 'ENGINE_OVERLOADED' },
    { event: 'accl_engine_pool_event', poolEvent: 'circuit_open' },
  ]);
  expect(records.join('')).not.toMatch(/fen|correlation|player|game|token/i);
});

test('throwing event and exporter sinks are isolated from runtime telemetry', () => {
  const telemetry = new EngineRuntimeTelemetry({}, {
    emitEvent: () => { throw new Error('event_sink_failed'); },
  });
  expect(() => telemetry.recordLatency('BOT_LIVE', 'queue', 10)).not.toThrow();
  expect(() => telemetry.recordOutcome('BOT_LIVE', 'success')).not.toThrow();
  expect(() => telemetry.recordPoolEvent('replacement_failure')).not.toThrow();

  const exporter = new EngineTelemetryExporter(
    telemetry,
    () => { throw new Error('refresh_failed'); },
    { write: () => { throw new Error('write_failed'); } }
  );
  expect(() => exporter.emit()).not.toThrow();
  const timerFailure = new EngineTelemetryExporter(telemetry, () => {}, {
    write: () => {},
    setInterval: (() => { throw new Error('timer_failed'); }) as typeof setInterval,
  });
  expect(() => timerFailure.start()).not.toThrow();
  expect(() => timerFailure.stop()).not.toThrow();
});
