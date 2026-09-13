import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { runtimeFailureEnvelope } from '@/lib/chess/runtime';
import {
  handleEngineHttpRequest,
  type EngineHttpRequest,
  type EngineHttpResponse,
} from '@/services/stockfish-engine/src/server';

type EngineHttpCoordinator = Parameters<typeof handleEngineHttpRequest>[0];

export const MAX_ENGINE_HTTP_BODY_BYTES = 16 * 1024;

const MALFORMED_BODY = Object.freeze({ malformed: true });

export type EngineNodeServerOptions = {
  requestTimeoutMs?: number;
  maxBodyBytes?: number;
};

/** Built-in Node adapter only; IAM authentication remains at Cloud Run ingress. */
export function createEngineNodeServer(
  coordinator: EngineHttpCoordinator,
  options: EngineNodeServerOptions = {}
): Server {
  const server = createServer((request, response) => {
    void serveNodeRequest(coordinator, request, response, options.maxBodyBytes).catch(() => {
      writeNodeResponse(response, protocolFailure());
    });
  });
  server.requestTimeout = options.requestTimeoutMs ?? 30_000;
  server.headersTimeout = Math.min(server.requestTimeout, 5_000);
  server.keepAliveTimeout = 5_000;
  return server;
}

async function serveNodeRequest(
  coordinator: EngineHttpCoordinator,
  request: IncomingMessage,
  response: ServerResponse,
  maxBodyBytes = MAX_ENGINE_HTTP_BODY_BYTES
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.once('aborted', abort);
  response.once('close', () => {
    if (!response.writableEnded) abort();
  });

  const method = request.method ?? '';
  const path = parsePath(request.url);
  let body: unknown;
  if (method === 'POST' && path === '/v1/evaluate') {
    body = await readJsonBody(request, maxBodyBytes);
  } else {
    request.resume();
  }

  const engineRequest: EngineHttpRequest = {
    method,
    path,
    body,
    signal: controller.signal,
  };
  const engineResponse = await handleEngineHttpRequest(coordinator, engineRequest);
  writeNodeResponse(response, engineResponse);
}

function parsePath(rawUrl: string | undefined): string {
  try {
    return new URL(rawUrl ?? '/', 'http://engine.internal').pathname;
  } catch {
    return '/__invalid_url__';
  }
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) return MALFORMED_BODY;
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    request.resume();
    return MALFORMED_BODY;
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  let overflow = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBodyBytes) {
      overflow = true;
      chunks.length = 0;
      continue;
    }
    if (!overflow) chunks.push(buffer);
  }
  if (overflow) return MALFORMED_BODY;
  if (chunks.length === 0) return MALFORMED_BODY;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return MALFORMED_BODY;
  }
}

function protocolFailure(): EngineHttpResponse {
  return {
    status: 502,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: runtimeFailureEnvelope('ENGINE_PROTOCOL_ERROR'),
  };
}

function writeNodeResponse(response: ServerResponse, engineResponse: EngineHttpResponse): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(engineResponse.status, engineResponse.headers);
  response.end(JSON.stringify(engineResponse.body));
}
