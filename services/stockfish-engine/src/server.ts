import {
  parseEngineRuntimeEnvelope,
  runtimeHttpStatus,
  runtimeFailureEnvelope,
  runtimeRetryAfterSeconds,
  type EngineRuntimeEnvelope,
} from '@/lib/chess/runtime';
import type { EngineRuntimeCoordinator } from '@/services/stockfish-engine/src/coordinator';
import { ENGINE_RUNTIME_WORKER_COUNT } from '@/lib/chess/runtime';

export type EngineHttpRequest = {
  method: string;
  path: string;
  body?: unknown;
  signal?: AbortSignal;
};

export type EngineHttpResponse = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
};

type CoordinatorPort = {
  evaluate(
    ...args: Parameters<EngineRuntimeCoordinator['evaluate']>
  ): ReturnType<EngineRuntimeCoordinator['evaluate']>;
  snapshot(): EngineReadySnapshot;
};

const USABLE_WORKER_STATES = ['IDLE', 'LEASED', 'RESETTING'] as const;

export type EngineReadySnapshot = {
  shuttingDown: boolean;
  pool: {
    accepting: boolean;
    requiresResidentMemoryMeasurement?: boolean;
    circuitOpenUntilMs: number | null;
    workers: Array<{ state: string; residentMemoryBytes?: number | null }>;
  };
};

export function isEngineRuntimeReady(snapshot: EngineReadySnapshot): boolean {
  if (snapshot.shuttingDown) return false;
  if (!snapshot.pool.accepting) return false;
  if (snapshot.pool.circuitOpenUntilMs !== null) return false;
  if (snapshot.pool.workers.length !== ENGINE_RUNTIME_WORKER_COUNT) return false;
  return snapshot.pool.workers.every((worker) =>
    (USABLE_WORKER_STATES as readonly string[]).includes(worker.state) &&
    (!snapshot.pool.requiresResidentMemoryMeasurement ||
      (typeof worker.residentMemoryBytes === 'number' && Number.isFinite(worker.residentMemoryBytes)))
  );
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
} as const;

/**
 * Transport-neutral handler for the Cloud Run ingress adapter. Google IAM has
 * already authenticated requests before they reach this private service.
 */
export async function handleEngineHttpRequest(
  coordinator: CoordinatorPort,
  request: EngineHttpRequest
): Promise<EngineHttpResponse> {
  if (request.method === 'GET' && request.path === '/healthz/live') {
    return response(200, { ok: true });
  }
  if (request.method === 'GET' && request.path === '/healthz/ready') {
    const ready = isEngineRuntimeReady(coordinator.snapshot());
    return response(ready ? 200 : 503, { ok: ready });
  }
  if (request.method !== 'POST' || request.path !== '/v1/evaluate') {
    return response(404, { ok: false });
  }

  let envelope: EngineRuntimeEnvelope;
  try {
    envelope = parseEngineRuntimeEnvelope(
      await coordinator.evaluate(request.body, request.signal)
    );
  } catch {
    envelope = runtimeFailureEnvelope('ENGINE_PROTOCOL_ERROR');
  }
  if (envelope.ok) return response(200, envelope);

  const status = runtimeHttpStatus(envelope.error.code);
  const retryHeaders: Readonly<Record<string, string>> = envelope.error.retryable
    ? { 'retry-after': String(runtimeRetryAfterSeconds(status === 503 ? 1 : 2)) }
    : {};
  return response(status, envelope, retryHeaders);
}

function response(
  status: number,
  body: EngineRuntimeEnvelope | { ok: boolean },
  extraHeaders: Readonly<Record<string, string>> = {}
): EngineHttpResponse {
  return { status, headers: { ...JSON_HEADERS, ...extraHeaders }, body };
}
