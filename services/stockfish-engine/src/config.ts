import {
  ENGINE_RUNTIME_WAITING_CAP,
  ENGINE_RUNTIME_WORKER_COUNT,
} from '@/lib/chess/runtime';

export const STOCKFISH_UPSTREAM_COMMIT = 'cb3d4ee9b47d0c5aae855b12379378ea1439675c';
export const STOCKFISH_BIG_NNUE_SHA256 =
  'c288c895ea924429ea9092e3f36b2b3c1f00f2a3a4c759ff7e57e79e3b43e4a7';
export const STOCKFISH_SMALL_NNUE_SHA256 =
  '37f18f62d772f3107e1d6aaca3898c130c3c86f2ab63e6555fbbca20635a899d';

export type EngineServiceConfig = {
  environment: 'development' | 'test' | 'production';
  port: number;
  workerCount: 2;
  queueCapacity: 8;
  cloudRunConcurrency: 32;
  requestTimeoutSeconds: 30;
  threadsPerWorker: 1;
  hashMiBPerWorker: 128;
  binaryPath: string | null;
  binarySha256: string | null;
  maxResidentMemoryBytes: number | null;
  imageDigest: string | null;
};

function exactInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  expected: number,
  fallback = expected
): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value !== expected) throw new EngineServiceConfigError(key);
  return value;
}

export function parseEngineServiceConfig(env: NodeJS.ProcessEnv): EngineServiceConfig {
  const environment = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(environment)) {
    throw new EngineServiceConfigError('NODE_ENV');
  }

  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new EngineServiceConfigError('PORT');
  }

  const binaryPath = env.STOCKFISH_BINARY_PATH?.trim() || null;
  const binarySha256 = env.STOCKFISH_BINARY_SHA256?.trim().toLowerCase() || null;
  if ((binaryPath === null) !== (binarySha256 === null)) {
    throw new EngineServiceConfigError('STOCKFISH_BINARY_IDENTITY');
  }
  if (binaryPath && /\.(?:js|wasm)$/i.test(binaryPath)) {
    throw new EngineServiceConfigError('STOCKFISH_BINARY_PATH');
  }
  if (binarySha256 && !/^[a-f0-9]{64}$/.test(binarySha256)) {
    throw new EngineServiceConfigError('STOCKFISH_BINARY_SHA256');
  }
  if (environment === 'production' && !binaryPath) {
    throw new EngineServiceConfigError('STOCKFISH_BINARY_PATH');
  }
  const rssRaw = env.STOCKFISH_MAX_RSS_BYTES?.trim();
  const maxResidentMemoryBytes = rssRaw ? Number(rssRaw) : null;
  if (maxResidentMemoryBytes !== null && (!Number.isSafeInteger(maxResidentMemoryBytes) || maxResidentMemoryBytes < 134_217_728 || maxResidentMemoryBytes > 2_147_483_648)) {
    throw new EngineServiceConfigError('STOCKFISH_MAX_RSS_BYTES');
  }
  const imageDigest = env.ENGINE_IMAGE_DIGEST?.trim().toLowerCase() || null;
  if (imageDigest !== null && !/^sha256:[a-f0-9]{64}$/.test(imageDigest)) {
    throw new EngineServiceConfigError('ENGINE_IMAGE_DIGEST');
  }

  return {
    environment: environment as EngineServiceConfig['environment'],
    port,
    workerCount: exactInteger(env, 'ENGINE_WORKER_COUNT', ENGINE_RUNTIME_WORKER_COUNT) as 2,
    queueCapacity: exactInteger(env, 'ENGINE_QUEUE_CAPACITY', ENGINE_RUNTIME_WAITING_CAP) as 8,
    cloudRunConcurrency: exactInteger(env, 'ENGINE_CLOUD_RUN_CONCURRENCY', 32) as 32,
    requestTimeoutSeconds: exactInteger(env, 'ENGINE_REQUEST_TIMEOUT_SECONDS', 30) as 30,
    threadsPerWorker: exactInteger(env, 'ENGINE_THREADS_PER_WORKER', 1) as 1,
    hashMiBPerWorker: exactInteger(env, 'ENGINE_HASH_MIB_PER_WORKER', 128) as 128,
    binaryPath,
    binarySha256,
    maxResidentMemoryBytes,
    imageDigest,
  };
}

export class EngineServiceConfigError extends Error {
  readonly code = 'ENGINE_CONFIG_INVALID' as const;

  constructor(readonly field: string) {
    super(`invalid_engine_service_config:${field}`);
    this.name = 'EngineServiceConfigError';
  }
}
