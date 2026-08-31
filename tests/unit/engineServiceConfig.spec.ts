import { expect, test } from '@playwright/test';

import {
  EngineServiceConfigError,
  parseEngineServiceConfig,
} from '@/services/stockfish-engine/src/config';

test('engine service config has locked capacity and no binary requirement outside production', () => {
  expect(parseEngineServiceConfig({ NODE_ENV: 'test' })).toMatchObject({
    environment: 'test',
    port: 8080,
    workerCount: 2,
    queueCapacity: 8,
    cloudRunConcurrency: 32,
    requestTimeoutSeconds: 30,
    threadsPerWorker: 1,
    hashMiBPerWorker: 128,
    binaryPath: null,
    maxResidentMemoryBytes: null,
    imageDigest: null,
  });
});

test('RSS threshold and image identity are optional but strictly bounded when supplied', () => {
  expect(parseEngineServiceConfig({
    NODE_ENV: 'test',
    STOCKFISH_MAX_RSS_BYTES: '1073741824',
    ENGINE_IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`,
  })).toMatchObject({ maxResidentMemoryBytes: 1_073_741_824, imageDigest: `sha256:${'a'.repeat(64)}` });
  expect(() => parseEngineServiceConfig({ NODE_ENV: 'test', STOCKFISH_MAX_RSS_BYTES: '1' })).toThrow(EngineServiceConfigError);
  expect(() => parseEngineServiceConfig({ NODE_ENV: 'test', ENGINE_IMAGE_DIGEST: 'latest' })).toThrow(EngineServiceConfigError);
});

test('production fails closed without exact native identity and rejects ASM/WASM', () => {
  expect(() => parseEngineServiceConfig({ NODE_ENV: 'production' })).toThrow(
    EngineServiceConfigError
  );
  expect(() =>
    parseEngineServiceConfig({
      NODE_ENV: 'production',
      STOCKFISH_BINARY_PATH: '/engine/stockfish-18.wasm',
      STOCKFISH_BINARY_SHA256: 'a'.repeat(64),
    })
  ).toThrow(EngineServiceConfigError);
});

test('capacity cannot silently drift from the locked values', () => {
  expect(() =>
    parseEngineServiceConfig({ NODE_ENV: 'test', ENGINE_WORKER_COUNT: '3' })
  ).toThrow(EngineServiceConfigError);
  expect(() =>
    parseEngineServiceConfig({ NODE_ENV: 'test', ENGINE_QUEUE_CAPACITY: '9' })
  ).toThrow(EngineServiceConfigError);
  expect(() =>
    parseEngineServiceConfig({ NODE_ENV: 'test', ENGINE_CLOUD_RUN_CONCURRENCY: '80' })
  ).toThrow(EngineServiceConfigError);
});
