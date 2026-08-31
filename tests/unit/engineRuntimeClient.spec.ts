import { expect, test } from '@playwright/test';

import type { EngineAnalysisResult } from '@/lib/chess';
import {
  ENGINE_RUNTIME_REQUEST_SCHEMA,
  EngineActorLimitError,
  EngineActorLimiter,
  EngineRuntimeClient,
  EngineRuntimeConfigurationError,
  buildEngineRuntimeExternalAccountOptions,
  createEngineRuntimeRemoteTransport,
  readEngineRuntimeRemoteConfig,
  type EngineRuntimeRequest,
} from '@/lib/chess/runtime';

const request: EngineRuntimeRequest = {
  schemaVersion: ENGINE_RUNTIME_REQUEST_SCHEMA,
  correlationId: 'client-test',
  engineFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  lane: 'BOT_LIVE',
  limits: { depth: 8, multiPv: 1, timeoutMs: 1_000 },
  remainingBudgetMs: 2_000,
};

const result: EngineAnalysisResult = {
  identity: { name: 'stockfish', version: 'test' },
  positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
  engineFen: request.engineFen,
  turn: 'w',
  pov: 'white',
  terminal: false,
  bestMove: 'e2e4',
  lines: [
    {
      rank: 1,
      move: 'e2e4',
      pv: ['e2e4'],
      score: { kind: 'cp', cp: 20 },
      depth: 8,
      bound: null,
    },
  ],
  limits: { depth: 8, multiPv: 1, timeoutMs: 1_000 },
};

test('client keeps actor/game scope upstream of the transport', async () => {
  let transported: unknown;
  const client = new EngineRuntimeClient(
    async (runtimeRequest) => {
      transported = runtimeRequest;
      return { ok: true, result };
    },
    undefined,
    () => 0
  );

  await expect(client.evaluate({ actorScope: 'private-player-and-game', request })).resolves.toBe(
    result
  );
  expect(transported).toEqual(request);
  expect(JSON.stringify(transported)).not.toContain('private-player-and-game');
});

test('actor limiter allows one running and one waiting, then rejects', async () => {
  const limiter = new EngineActorLimiter();
  let releaseFirst!: () => void;
  const firstBarrier = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const order: string[] = [];

  const first = limiter.run('scope', async () => {
    order.push('first-start');
    await firstBarrier;
    order.push('first-end');
    return 1;
  });
  const second = limiter.run('scope', async () => {
    order.push('second');
    return 2;
  });
  const third = limiter.run('scope', async () => 3);

  await expect(third).rejects.toBeInstanceOf(EngineActorLimitError);
  releaseFirst();
  await expect(first).resolves.toBe(1);
  await expect(second).resolves.toBe(2);
  expect(order).toEqual(['first-start', 'first-end', 'second']);
  expect(limiter.snapshot()).toEqual({ actors: 0, running: 0, waiting: 0 });
});

test('queued caller cancellation is typed and never starts its operation', async () => {
  const limiter = new EngineActorLimiter();
  let releaseFirst!: () => void;
  const firstBarrier = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let ran = false;
  const controller = new AbortController();

  const first = limiter.run('scope', async () => firstBarrier);
  const second = limiter.run(
    'scope',
    async () => {
      ran = true;
    },
    controller.signal
  );
  controller.abort();

  await expect(second).rejects.toMatchObject({
    failure: { code: 'ENGINE_REQUEST_CANCELLED', retryable: false },
  });
  releaseFirst();
  await first;
  expect(ran).toBe(false);
});

const lockedEnvironment = {
  GCP_PROJECT_ID: 'vivid-spot-506818-k3',
  GCP_PROJECT_NUMBER: '368422827133',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-accl',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-production',
  GCP_SERVICE_ACCOUNT_EMAIL:
    'accl-engine-invoker@vivid-spot-506818-k3.iam.gserviceaccount.com',
  ENGINE_RUNTIME_URL: 'https://accl-stockfish-engine-368422827133.us-east4.run.app',
  ENGINE_RUNTIME_AUDIENCE:
    'https://accl-stockfish-engine-368422827133.us-east4.run.app',
} as const;

test('remote config fails closed and derives the two locked provider audiences', () => {
  const config = readEngineRuntimeRemoteConfig(lockedEnvironment);

  expect(config).toMatchObject({
    projectId: 'vivid-spot-506818-k3',
    projectNumber: '368422827133',
    serviceAccountEmail:
      'accl-engine-invoker@vivid-spot-506818-k3.iam.gserviceaccount.com',
    runtimeUrl: 'https://accl-stockfish-engine-368422827133.us-east4.run.app',
    runtimeAudience: 'https://accl-stockfish-engine-368422827133.us-east4.run.app',
    providerResourceAudience:
      '//iam.googleapis.com/projects/368422827133/locations/global/workloadIdentityPools/vercel-accl/providers/vercel-production',
    providerTokenAudience:
      'https://iam.googleapis.com/projects/368422827133/locations/global/workloadIdentityPools/vercel-accl/providers/vercel-production',
  });

  expect(() =>
    readEngineRuntimeRemoteConfig({ ...lockedEnvironment, ENGINE_RUNTIME_AUDIENCE: 'wrong' })
  ).toThrow(EngineRuntimeConfigurationError);
  expect(() =>
    readEngineRuntimeRemoteConfig({ ...lockedEnvironment, GCP_PROJECT_NUMBER: undefined })
  ).toThrow('invalid_engine_runtime_configuration:gcp_project_number');
});

test('external-account options bind STS to the locked custom-audience token supplier', async () => {
  const config = readEngineRuntimeRemoteConfig(lockedEnvironment);
  const requestedAudiences: string[] = [];
  const options = buildEngineRuntimeExternalAccountOptions(config, async (audience) => {
    requestedAudiences.push(audience);
    return 'vercel-oidc-token';
  });

  expect(options).toMatchObject({
    type: 'external_account',
    audience: config.providerResourceAudience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  await expect(
    options.subject_token_supplier?.getSubjectToken({
      audience: config.providerResourceAudience,
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
    } as never)
  ).resolves.toBe('vercel-oidc-token');
  expect(requestedAudiences).toEqual([config.providerTokenAudience]);

  await expect(
    options.subject_token_supplier?.getSubjectToken({
      audience: '//iam.googleapis.com/projects/wrong',
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
    } as never)
  ).rejects.toThrow('invalid_engine_runtime_subject_token_context');
});

test('authenticated transport sends only the canonical request to the exact private route', async () => {
  let fetchedUrl: string | URL | Request = '';
  let fetchedInit: RequestInit | undefined;
  const transport = createEngineRuntimeRemoteTransport({
    env: lockedEnvironment,
    authorizationProvider: async () => 'Bearer google-id-token',
    fetchImpl: async (url, init) => {
      fetchedUrl = url;
      fetchedInit = init;
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    },
  });

  await expect(transport(request)).resolves.toEqual({ ok: true, result });
  expect(String(fetchedUrl)).toBe(
    'https://accl-stockfish-engine-368422827133.us-east4.run.app/v1/evaluate'
  );
  expect(fetchedInit?.method).toBe('POST');
  expect(fetchedInit?.cache).toBe('no-store');
  expect(fetchedInit?.redirect).toBe('error');
  expect(new Headers(fetchedInit?.headers).get('authorization')).toBe(
    'Bearer google-id-token'
  );
  expect(JSON.parse(String(fetchedInit?.body))).toEqual(request);
  expect(String(fetchedInit?.body)).not.toContain('actorScope');
});

test('authenticated transport rejects auth failures and status-envelope disagreement', async () => {
  let fetchCalls = 0;
  const authFailure = createEngineRuntimeRemoteTransport({
    env: lockedEnvironment,
    authorizationProvider: async () => {
      throw new Error('token-not-available');
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('must-not-run');
    },
  });

  await expect(authFailure(request)).resolves.toEqual({
    ok: false,
    error: { code: 'ENGINE_POOL_UNAVAILABLE', retryable: true },
  });
  expect(fetchCalls).toBe(0);

  const mismatchedStatus = createEngineRuntimeRemoteTransport({
    env: lockedEnvironment,
    authorizationProvider: async () => 'Bearer google-id-token',
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: true, result }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
  });
  await expect(mismatchedStatus(request)).resolves.toEqual({
    ok: false,
    error: { code: 'ENGINE_PROTOCOL_ERROR', retryable: false },
  });
});

test('authenticated transport classifies caller abort and its own total deadline distinctly', async () => {
  const neverAuthorize = () => new Promise<string>(() => undefined);
  const transport = createEngineRuntimeRemoteTransport({
    env: lockedEnvironment,
    authorizationProvider: neverAuthorize,
    fetchImpl: async () => {
      throw new Error('must-not-run');
    },
  });

  const controller = new AbortController();
  const cancelled = transport(request, controller.signal);
  controller.abort();
  await expect(cancelled).resolves.toEqual({
    ok: false,
    error: { code: 'ENGINE_REQUEST_CANCELLED', retryable: false },
  });

  await expect(
    transport({ ...request, remainingBudgetMs: 5 })
  ).resolves.toEqual({
    ok: false,
    error: { code: 'ENGINE_TOTAL_TIMEOUT', retryable: true },
  });
});

test('authenticated transport keeps the total deadline through response-body consumption', async () => {
  const transport = createEngineRuntimeRemoteTransport({
    env: lockedEnvironment,
    authorizationProvider: async () => 'Bearer google-id-token',
    fetchImpl: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start() {
            // Deliberately never enqueue or close: the deadline must settle the caller.
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ),
  });

  await expect(
    transport({ ...request, remainingBudgetMs: 5 })
  ).resolves.toEqual({
    ok: false,
    error: { code: 'ENGINE_TOTAL_TIMEOUT', retryable: true },
  });
});

test('client total deadline includes actor-limiter wait and settles before the running peer', async () => {
  let releaseFirst!: () => void;
  const firstBarrier = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const client = new EngineRuntimeClient(async (runtimeRequest) => {
    if (runtimeRequest.correlationId === 'first') await firstBarrier;
    return { ok: true, result };
  });

  const first = client.evaluate({
    actorScope: 'same-actor',
    request: { ...request, correlationId: 'first', remainingBudgetMs: 1_000 },
  });
  const second = client.evaluate({
    actorScope: 'same-actor',
    request: { ...request, correlationId: 'second', remainingBudgetMs: 10 },
  });

  await expect(second).rejects.toMatchObject({
    envelope: {
      ok: false,
      error: { code: 'ENGINE_TOTAL_TIMEOUT', retryable: true },
    },
  });
  releaseFirst();
  await expect(first).resolves.toBe(result);
});

test('client decrements the forwarded total budget by local admission time', async () => {
  const ticks = [100, 125];
  let transported: EngineRuntimeRequest | undefined;
  const client = new EngineRuntimeClient(
    async (runtimeRequest) => {
      transported = runtimeRequest;
      return { ok: true, result };
    },
    undefined,
    () => ticks.shift() ?? 125
  );

  await client.evaluate({ actorScope: 'actor', request });
  expect(transported?.remainingBudgetMs).toBe(1_975);
});
