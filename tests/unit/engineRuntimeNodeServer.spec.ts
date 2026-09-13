import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, test } from '@playwright/test';

import type { EngineRuntimeEnvelope } from '@/lib/chess/runtime';
import {
  createEngineNodeServer,
  MAX_ENGINE_HTTP_BODY_BYTES,
} from '@/services/stockfish-engine/src/nodeServer';

function fakeCoordinator(evaluate: (body: unknown, signal?: AbortSignal) => Promise<EngineRuntimeEnvelope>) {
  return {
    evaluate,
    snapshot() {
      return {
        shuttingDown: false,
        pool: {
          accepting: true,
          circuitOpenUntilMs: null,
          workers: [{ state: 'IDLE' }],
        },
      };
    },
  };
}

test('Node adapter parses bounded JSON and preserves the typed no-store response', async () => {
  let seen: unknown;
  const server = createEngineNodeServer(
    fakeCoordinator(async (body) => {
      seen = body;
      return { ok: false, error: { code: 'ENGINE_OVERLOADED', retryable: true } };
    })
  );
  const address = await listen(server);
  try {
    const response = await send(address.port, '/v1/evaluate?ignored=true', '{"schemaVersion":"x"}');
    expect(seen).toEqual({ schemaVersion: 'x' });
    expect(response).toEqual({
      status: 503,
      headers: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'no-store',
        retryAfter: '1',
      },
      body: { ok: false, error: { code: 'ENGINE_OVERLOADED', retryable: true } },
    });
  } finally {
    await close(server);
  }
});

test('Node adapter bounds malformed and oversized bodies without echoing them', async () => {
  const bodies: unknown[] = [];
  const server = createEngineNodeServer(
    fakeCoordinator(async (body) => {
      bodies.push(body);
      return { ok: false, error: { code: 'ENGINE_PROTOCOL_ERROR', retryable: false } };
    })
  );
  const address = await listen(server);
  try {
    const malformed = await send(address.port, '/v1/evaluate', '{secret-invalid-json');
    const oversized = await send(
      address.port,
      '/v1/evaluate',
      JSON.stringify({ value: 's'.repeat(MAX_ENGINE_HTTP_BODY_BYTES) })
    );
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(malformed)).not.toContain('secret-invalid-json');
    expect(JSON.stringify(oversized)).not.toContain('ssssssss');
    expect(malformed.status).toBe(502);
    expect(oversized.status).toBe(502);
  } finally {
    await close(server);
  }
});

test('Node adapter aborts a running evaluation when the caller disconnects', async () => {
  let signal: AbortSignal | undefined;
  let release: (() => void) | undefined;
  const server = createEngineNodeServer(
    fakeCoordinator(
      async (_body, requestSignal) =>
        await new Promise<EngineRuntimeEnvelope>((resolve) => {
          signal = requestSignal;
          release = () =>
            resolve({ ok: false, error: { code: 'ENGINE_REQUEST_CANCELLED', retryable: false } });
        })
    )
  );
  const address = await listen(server);
  const request = httpRequest({
    host: '127.0.0.1',
    port: address.port,
    method: 'POST',
    path: '/v1/evaluate',
    headers: { 'content-type': 'application/json' },
  });
  request.on('error', () => undefined);
  request.end('{}');
  try {
    await expect.poll(() => Boolean(signal)).toBe(true);
    request.destroy();
    await expect.poll(() => signal?.aborted).toBe(true);
  } finally {
    release?.();
    server.closeAllConnections();
    await close(server);
  }
});

function listen(server: ReturnType<typeof createEngineNodeServer>): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address() as AddressInfo));
  });
}

function close(server: ReturnType<typeof createEngineNodeServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function send(port: number, path: string, body: string): Promise<{
  status: number;
  headers: { contentType?: string; cacheControl?: string; retryAfter?: string };
  body: unknown;
}> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: {
              contentType: response.headers['content-type'],
              cacheControl: response.headers['cache-control'],
              retryAfter: response.headers['retry-after'],
            },
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
          });
        });
      }
    );
    request.on('error', reject);
    request.end(body);
  });
}
