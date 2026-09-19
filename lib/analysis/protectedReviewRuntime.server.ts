import { randomUUID } from 'node:crypto';

import { buildEngineAnalysisResult, runHeuristicAnalysis } from '@/lib/analysis/analyze';
import { sanitizeAnalysisRows } from '@/lib/analysis/classify';
import { engineEvalFromWhitePovResult } from '@/lib/analysis/engine';
import { ChessTruthError, type TruthPayload } from '@/lib/analysis/intelligence';
import { configForMode, type IntelligenceMode } from '@/lib/analysis/modes';
import { parsePosition } from '@/lib/chess';
import {
  ENGINE_RUNTIME_LANE_POLICIES,
  ENGINE_RUNTIME_REQUEST_SCHEMA,
  EngineActorLimitError,
  EngineRuntimeClient,
  EngineRuntimeRemoteError,
  createEngineRuntimeRemoteTransport,
  runtimeFailureEnvelope,
} from '@/lib/chess/runtime';

const ACTIVATION_FLAG = 'ENGINE_PROTECTED_REVIEW_RUNTIME_ENABLED';

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;
type RuntimeEvaluator = Pick<EngineRuntimeClient, 'evaluate'>;

export type ProtectedReviewRuntimeObservation = {
  event: 'protected_review_engine_runtime';
  correlationId: string;
  lane: 'PROTECTED_REVIEW';
  outcome: 'ok' | 'error';
  failureCode: string | null;
  durationMs: number;
};

export class ProtectedReviewRuntimeDisabledError extends Error {
  constructor() {
    super('protected_review_engine_runtime_disabled');
    this.name = 'ProtectedReviewRuntimeDisabledError';
  }
}

let sharedClient: EngineRuntimeClient | null = null;

function defaultClient(): EngineRuntimeClient {
  if (!sharedClient) {
    sharedClient = new EngineRuntimeClient(createEngineRuntimeRemoteTransport());
  }
  return sharedClient;
}

function defaultObserver(observation: ProtectedReviewRuntimeObservation): void {
  console.info(JSON.stringify(observation));
}

export async function getProtectedReviewRuntimeTruth(input: {
  /** Private in-process limiter key. Never forwarded or logged. */
  actorScope: string;
  fen: string;
  mode: IntelligenceMode;
  moves: { san: string }[];
  signal?: AbortSignal;
  env?: RuntimeEnvironment;
  client?: RuntimeEvaluator;
  correlationIdFactory?: () => string;
  observe?: (observation: ProtectedReviewRuntimeObservation) => void;
}): Promise<TruthPayload> {
  let position;
  try {
    position = parsePosition(input.fen);
  } catch {
    throw new ChessTruthError('INVALID_FEN');
  }

  const config = configForMode(input.mode);
  if (!config.useEngine) {
    const raw = await runHeuristicAnalysis(input.moves);
    return {
      rows: sanitizeAnalysisRows(raw.rows, config.depth),
      mode: input.mode,
      tablebaseHook: null,
      openingDbHook: null,
    };
  }

  const env = input.env ?? process.env;
  if (env[ACTIVATION_FLAG] !== 'true') {
    throw new ProtectedReviewRuntimeDisabledError();
  }

  const correlationId = (input.correlationIdFactory ?? randomUUID)();
  const startedAt = performance.now();
  const observe = input.observe ?? defaultObserver;

  try {
    const result = await (input.client ?? defaultClient()).evaluate({
      actorScope: input.actorScope,
      request: {
        schemaVersion: ENGINE_RUNTIME_REQUEST_SCHEMA,
        correlationId,
        engineFen: position.engineFen,
        lane: 'PROTECTED_REVIEW',
        limits: {
          depth: config.depth,
          multiPv: config.multiPv,
          timeoutMs: config.timeoutMs,
        },
        remainingBudgetMs: ENGINE_RUNTIME_LANE_POLICIES.PROTECTED_REVIEW.totalCeilingMs,
      },
      signal: input.signal,
    });

    if (result.positionKey !== position.positionKey || result.engineFen !== position.engineFen) {
      throw new EngineRuntimeRemoteError(runtimeFailureEnvelope('ENGINE_PROTOCOL_ERROR'));
    }

    const evalResult = engineEvalFromWhitePovResult(
      result,
      position.turn,
      config.depth,
      config.multiPv
    );
    const raw = buildEngineAnalysisResult({
      fen: position.engineFen,
      depth: config.depth,
      moves: input.moves,
      evalResult,
    });
    observe({
      event: 'protected_review_engine_runtime',
      correlationId,
      lane: 'PROTECTED_REVIEW',
      outcome: 'ok',
      failureCode: null,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    return {
      rows: sanitizeAnalysisRows(raw.rows, config.depth),
      engine: raw.engine,
      mode: input.mode,
      tablebaseHook: null,
      openingDbHook: null,
    };
  } catch (error) {
    const normalized =
      error instanceof EngineActorLimitError
        ? new EngineRuntimeRemoteError(runtimeFailureEnvelope(error.failure.code))
        : error;
    observe({
      event: 'protected_review_engine_runtime',
      correlationId,
      lane: 'PROTECTED_REVIEW',
      outcome: 'error',
      failureCode:
        normalized instanceof EngineRuntimeRemoteError ? normalized.envelope.error.code : 'UNEXPECTED',
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    throw normalized;
  }
}
