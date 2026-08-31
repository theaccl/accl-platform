import type { AddressInfo } from 'node:net';

import { EngineRuntimeCoordinator } from '@/services/stockfish-engine/src/coordinator';
import {
  EngineServiceConfigError,
  parseEngineServiceConfig,
  type EngineServiceConfig,
} from '@/services/stockfish-engine/src/config';
import { createEngineNodeServer } from '@/services/stockfish-engine/src/nodeServer';
import { EngineWorkerPool } from '@/services/stockfish-engine/src/pool';
import {
  createEngineServiceShutdown,
  installEngineShutdownSignals,
  type EngineServiceShutdownResult,
} from '@/services/stockfish-engine/src/shutdown';
import { executeStockfishLease } from '@/services/stockfish-engine/src/stockfishExecutor';
import { createProductionStockfishWorkerFactory } from '@/services/stockfish-engine/src/stockfishProcess';

export const ENGINE_SHUTDOWN_TIMEOUT_MS = 8_000;
export const ENGINE_HARD_EXIT_MS = 9_000;

export type EngineServiceRuntime = {
  readonly config: EngineServiceConfig;
  readonly coordinator: EngineRuntimeCoordinator;
  start(): Promise<AddressInfo>;
  shutdown(): Promise<EngineServiceShutdownResult>;
};

export function createProductionEngineServiceRuntime(
  env: NodeJS.ProcessEnv = process.env
): EngineServiceRuntime {
  const config = parseEngineServiceConfig(env);
  if (!config.binaryPath || !config.binarySha256) {
    throw new EngineServiceConfigError('STOCKFISH_BINARY_IDENTITY');
  }

  const pool = new EngineWorkerPool(
    createProductionStockfishWorkerFactory({
      executablePath: config.binaryPath,
      executableSha256: config.binarySha256,
    })
  );
  const coordinator = new EngineRuntimeCoordinator(pool, executeStockfishLease);
  const server = createEngineNodeServer(coordinator, {
    requestTimeoutMs: config.requestTimeoutSeconds * 1_000,
  });
  const shutdown = createEngineServiceShutdown(server, coordinator, {
    timeoutMs: ENGINE_SHUTDOWN_TIMEOUT_MS,
  });
  let started = false;

  return {
    config,
    coordinator,
    async start() {
      if (started) throw new Error('engine_service_already_started');
      try {
        await pool.start();
        const address = await listen(server, config.port);
        started = true;
        return address;
      } catch (error) {
        await shutdown();
        throw error;
      }
    },
    shutdown,
  };
}

export async function runProductionEngineService(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const runtime = createProductionEngineServiceRuntime(env);
  installEngineShutdownSignals(runtime.shutdown, process, ENGINE_HARD_EXIT_MS);
  await runtime.start();
}

function listen(server: ReturnType<typeof createEngineNodeServer>, port: number): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('engine_service_address_invalid'));
        return;
      }
      resolve(address);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}
