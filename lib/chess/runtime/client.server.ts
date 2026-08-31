import type { EngineAnalysisResult } from '@/lib/chess/engine/types';
import { EngineActorLimiter } from '@/lib/chess/runtime/actorLimiter.server';
import {
  parseEngineRuntimeRequest,
  parseEngineRuntimeEnvelope,
  runtimeFailureEnvelope,
  runtimeHttpStatus,
  type EngineRuntimeEnvelope,
  type EngineRuntimeFailureCode,
  type EngineRuntimeRequest,
} from '@/lib/chess/runtime/contracts';
import {
  IdentityPoolClient,
  IdTokenClient,
  Impersonated,
  type IdentityPoolClientOptions,
} from 'google-auth-library';

export type EngineRuntimeTransport = (
  request: EngineRuntimeRequest,
  signal?: AbortSignal
) => Promise<EngineRuntimeEnvelope>;

export class EngineRuntimeRemoteError extends Error {
  readonly envelope: Extract<EngineRuntimeEnvelope, { ok: false }>;

  constructor(envelope: Extract<EngineRuntimeEnvelope, { ok: false }>) {
    super(envelope.error.code.toLowerCase());
    this.name = 'EngineRuntimeRemoteError';
    this.envelope = envelope;
  }
}

export class EngineRuntimeClient {
  private readonly limiter: EngineActorLimiter;

  constructor(
    private readonly transport: EngineRuntimeTransport,
    limiter = new EngineActorLimiter(),
    private readonly now: () => number = () => performance.now()
  ) {
    this.limiter = limiter;
  }

  evaluate(input: {
    /** Server-only actor/game scope. It is never forwarded to the transport. */
    actorScope: string;
    request: EngineRuntimeRequest;
    signal?: AbortSignal;
  }): Promise<EngineAnalysisResult> {
    const request = parseEngineRuntimeRequest(input.request);
    const admittedAt = this.now();
    const deadline = createDeadlineSignal(input.signal, request.remainingBudgetMs);

    return this.limiter
      .run(
        input.actorScope,
        async () => {
          const elapsedMs = Math.max(0, this.now() - admittedAt);
          const remainingBudgetMs = Math.floor(request.remainingBudgetMs - elapsedMs);
          if (remainingBudgetMs <= 0) throw localRuntimeError('ENGINE_TOTAL_TIMEOUT');

          const envelope = parseEngineRuntimeEnvelope(
            await this.transport({ ...request, remainingBudgetMs }, deadline.signal)
          );
          if (!envelope.ok) throw new EngineRuntimeRemoteError(envelope);
          return envelope.result;
        },
        deadline.signal
      )
      .catch((error: unknown) => {
        if (deadline.cause() === 'deadline') throw localRuntimeError('ENGINE_TOTAL_TIMEOUT');
        throw error;
      })
      .finally(deadline.dispose);
  }
}

const LOCKED_ENGINE_RUNTIME_ENVIRONMENT = {
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

const VERCEL_TEAM_ID = 'team_yA8f8dmVRsDhGTfYZrhgWx9W';
const VERCEL_PROJECT_ID = 'prj_4sXBggXOnsp61bbr5Cq9MMGVLoFz';
const GOOGLE_STS_TOKEN_URL = 'https://sts.googleapis.com/v1/token';
const GOOGLE_IAM_CREDENTIALS_ENDPOINT = 'https://iamcredentials.googleapis.com';
const GOOGLE_SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt';
const ENGINE_OPERATION_PATH = '/v1/evaluate';
const MAX_ENGINE_RESPONSE_BYTES = 1024 * 1024;

export type EngineRuntimeServerEnvironment = Readonly<Record<string, string | undefined>>;

export type EngineRuntimeRemoteConfig = {
  projectId: string;
  projectNumber: string;
  workloadIdentityPoolId: string;
  workloadIdentityPoolProviderId: string;
  serviceAccountEmail: string;
  runtimeUrl: string;
  runtimeAudience: string;
  providerResourceAudience: string;
  providerTokenAudience: string;
};

export type EngineRuntimeAuthorizationProvider = () => Promise<string>;

export type EngineRuntimeRemoteTransportOptions = {
  env?: EngineRuntimeServerEnvironment;
  fetchImpl?: typeof fetch;
  authorizationProvider?: EngineRuntimeAuthorizationProvider;
  oidcTokenSupplier?: (audience: string) => Promise<string>;
};

export class EngineRuntimeConfigurationError extends Error {
  constructor(key: keyof typeof LOCKED_ENGINE_RUNTIME_ENVIRONMENT | 'runtime_context') {
    super(`invalid_engine_runtime_configuration:${key.toLowerCase()}`);
    this.name = 'EngineRuntimeConfigurationError';
  }
}

export function readEngineRuntimeRemoteConfig(
  env: EngineRuntimeServerEnvironment = process.env
): EngineRuntimeRemoteConfig {
  if (typeof window !== 'undefined') {
    throw new EngineRuntimeConfigurationError('runtime_context');
  }

  for (const [key, expected] of Object.entries(LOCKED_ENGINE_RUNTIME_ENVIRONMENT)) {
    if (env[key] !== expected) {
      throw new EngineRuntimeConfigurationError(
        key as keyof typeof LOCKED_ENGINE_RUNTIME_ENVIRONMENT
      );
    }
  }

  const projectNumber = LOCKED_ENGINE_RUNTIME_ENVIRONMENT.GCP_PROJECT_NUMBER;
  const workloadIdentityPoolId =
    LOCKED_ENGINE_RUNTIME_ENVIRONMENT.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const workloadIdentityPoolProviderId =
    LOCKED_ENGINE_RUNTIME_ENVIRONMENT.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const providerPath =
    `projects/${projectNumber}/locations/global/workloadIdentityPools/` +
    `${workloadIdentityPoolId}/providers/${workloadIdentityPoolProviderId}`;

  return {
    projectId: LOCKED_ENGINE_RUNTIME_ENVIRONMENT.GCP_PROJECT_ID,
    projectNumber,
    workloadIdentityPoolId,
    workloadIdentityPoolProviderId,
    serviceAccountEmail: LOCKED_ENGINE_RUNTIME_ENVIRONMENT.GCP_SERVICE_ACCOUNT_EMAIL,
    runtimeUrl: LOCKED_ENGINE_RUNTIME_ENVIRONMENT.ENGINE_RUNTIME_URL,
    runtimeAudience: LOCKED_ENGINE_RUNTIME_ENVIRONMENT.ENGINE_RUNTIME_AUDIENCE,
    providerResourceAudience: `//iam.googleapis.com/${providerPath}`,
    providerTokenAudience: `https://iam.googleapis.com/${providerPath}`,
  };
}

export function buildEngineRuntimeExternalAccountOptions(
  config: EngineRuntimeRemoteConfig,
  oidcTokenSupplier: (audience: string) => Promise<string>
): IdentityPoolClientOptions {
  return {
    type: 'external_account',
    audience: config.providerResourceAudience,
    subject_token_type: GOOGLE_SUBJECT_TOKEN_TYPE,
    token_url: GOOGLE_STS_TOKEN_URL,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    subject_token_supplier: {
      async getSubjectToken(context) {
        if (
          context.audience !== config.providerResourceAudience ||
          context.subjectTokenType !== GOOGLE_SUBJECT_TOKEN_TYPE
        ) {
          throw new Error('invalid_engine_runtime_subject_token_context');
        }
        return oidcTokenSupplier(config.providerTokenAudience);
      },
    },
  };
}

export function createEngineRuntimeRemoteTransport(
  options: EngineRuntimeRemoteTransportOptions = {}
): EngineRuntimeTransport {
  const config = readEngineRuntimeRemoteConfig(options.env);
  const authorizationProvider =
    options.authorizationProvider ??
    createGoogleEngineRuntimeAuthorizationProvider(
      config,
      options.oidcTokenSupplier ?? getLockedVercelOidcToken
    );
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (request, signal) => {
    const deadline = createDeadlineSignal(signal, request.remainingBudgetMs);
    try {
      return await executeEngineRuntimeRemoteRequest(
        config,
        authorizationProvider,
        fetchImpl,
        request,
        deadline
      );
    } finally {
      deadline.dispose();
    }
  };
}

async function executeEngineRuntimeRemoteRequest(
  config: EngineRuntimeRemoteConfig,
  authorizationProvider: EngineRuntimeAuthorizationProvider,
  fetchImpl: typeof fetch,
  request: EngineRuntimeRequest,
  deadline: ReturnType<typeof createDeadlineSignal>
): Promise<EngineRuntimeEnvelope> {
  let response: Response;
  try {
    const authorization = await raceWithSignal(authorizationProvider(), deadline.signal);
    if (!/^Bearer [^\s]+$/.test(authorization)) {
      return runtimeFailureEnvelope('ENGINE_POOL_UNAVAILABLE');
    }

    response = await fetchImpl(`${config.runtimeUrl}${ENGINE_OPERATION_PATH}`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json',
      },
      body: JSON.stringify(request),
      signal: deadline.signal,
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    return runtimeFailureEnvelope(failureCodeForDeadline(deadline.cause()));
  }

  if (response.status === 401 || response.status === 403) {
    return runtimeFailureEnvelope('ENGINE_POOL_UNAVAILABLE');
  }
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return runtimeFailureEnvelope(
      response.status >= 500 ? 'ENGINE_POOL_UNAVAILABLE' : 'ENGINE_PROTOCOL_ERROR'
    );
  }

  let body: unknown;
  try {
    const text = await raceWithSignal(response.text(), deadline.signal);
    if (Buffer.byteLength(text, 'utf8') > MAX_ENGINE_RESPONSE_BYTES) {
      return runtimeFailureEnvelope('ENGINE_PROTOCOL_ERROR');
    }
    body = JSON.parse(text) as unknown;
  } catch {
    const deadlineFailure = failureCodeForDeadline(deadline.cause());
    return runtimeFailureEnvelope(
      deadlineFailure === 'ENGINE_POOL_UNAVAILABLE' ? 'ENGINE_PROTOCOL_ERROR' : deadlineFailure
    );
  }

  let envelope: EngineRuntimeEnvelope;
  try {
    envelope = parseEngineRuntimeEnvelope(body);
  } catch {
    return runtimeFailureEnvelope('ENGINE_PROTOCOL_ERROR');
  }

  const expectedStatus = envelope.ok ? 200 : runtimeHttpStatus(envelope.error.code);
  return response.status === expectedStatus
    ? envelope
    : runtimeFailureEnvelope('ENGINE_PROTOCOL_ERROR');
}

function createGoogleEngineRuntimeAuthorizationProvider(
  config: EngineRuntimeRemoteConfig,
  oidcTokenSupplier: (audience: string) => Promise<string>
): EngineRuntimeAuthorizationProvider {
  const externalAccount = new IdentityPoolClient(
    buildEngineRuntimeExternalAccountOptions(config, oidcTokenSupplier)
  );
  const impersonated = new Impersonated({
    sourceClient: externalAccount,
    targetPrincipal: config.serviceAccountEmail,
    targetScopes: [],
    delegates: [],
    endpoint: GOOGLE_IAM_CREDENTIALS_ENDPOINT,
  });
  const idTokenClient = new IdTokenClient({
    targetAudience: config.runtimeAudience,
    idTokenProvider: impersonated,
  });

  return async () => {
    const headers = await idTokenClient.getRequestHeaders(config.runtimeUrl);
    const authorization = headers.get('authorization');
    if (!authorization) throw new Error('engine_runtime_id_token_unavailable');
    return authorization;
  };
}

async function getLockedVercelOidcToken(audience: string): Promise<string> {
  const { getVercelOidcToken } = await import('@vercel/oidc');
  return getVercelOidcToken({
    audience,
    team: VERCEL_TEAM_ID,
    project: VERCEL_PROJECT_ID,
    expirationBufferMs: 60_000,
  });
}

type DeadlineCause = 'caller' | 'deadline' | null;

function createDeadlineSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number
): {
  signal: AbortSignal;
  cause: () => DeadlineCause;
  dispose: () => void;
} {
  const controller = new AbortController();
  let cause: DeadlineCause = null;
  let disposed = false;

  const abortFromCaller = () => {
    if (cause !== null) return;
    cause = 'caller';
    controller.abort(callerSignal?.reason);
  };
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

  const timer = setTimeout(() => {
    if (cause !== null) return;
    cause = 'deadline';
    controller.abort(new DOMException('engine_runtime_total_timeout', 'TimeoutError'));
  }, Math.max(1, Math.floor(timeoutMs)));

  return {
    signal: controller.signal,
    cause: () => cause,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

function failureCodeForDeadline(cause: DeadlineCause): EngineRuntimeFailureCode {
  if (cause === 'caller') return 'ENGINE_REQUEST_CANCELLED';
  if (cause === 'deadline') return 'ENGINE_TOTAL_TIMEOUT';
  return 'ENGINE_POOL_UNAVAILABLE';
}

function localRuntimeError(code: EngineRuntimeFailureCode): EngineRuntimeRemoteError {
  return new EngineRuntimeRemoteError(runtimeFailureEnvelope(code));
}
