import type {
  EngineAnalysisResult,
  EngineLine,
  EngineScore,
  EngineSearchLimits,
} from '@/lib/chess/engine/types';
import { isLegalUciPv, parsePosition } from '@/lib/chess/position';

export const ENGINE_RUNTIME_REQUEST_SCHEMA = 'accl.engine.runtime.request.1' as const;

export const ENGINE_RUNTIME_LANES = [
  'BOT_LIVE',
  'TRAINER_INTERACTIVE',
  'PROTECTED_REVIEW',
  'POST_GAME_BATCH',
] as const;

export type EngineRuntimeLane = (typeof ENGINE_RUNTIME_LANES)[number];

export type EngineRuntimeRequest = {
  schemaVersion: typeof ENGINE_RUNTIME_REQUEST_SCHEMA;
  correlationId: string;
  engineFen: string;
  lane: EngineRuntimeLane;
  limits: EngineSearchLimits;
  remainingBudgetMs: number;
};

export const ENGINE_RUNTIME_FAILURE_CODES = [
  'INVALID_POSITION',
  'ENGINE_ACTOR_LIMIT',
  'ENGINE_OVERLOADED',
  'ENGINE_QUEUE_TIMEOUT',
  'ENGINE_SEARCH_TIMEOUT',
  'ENGINE_TOTAL_TIMEOUT',
  'ENGINE_REQUEST_CANCELLED',
  'ENGINE_CRASHED',
  'ENGINE_PROTOCOL_ERROR',
  'ENGINE_POOL_UNAVAILABLE',
] as const;

export type EngineRuntimeFailureCode = (typeof ENGINE_RUNTIME_FAILURE_CODES)[number];

export type EngineRuntimeFailure = {
  code: EngineRuntimeFailureCode;
  retryable: boolean;
};

export type EngineRuntimeSuccess = { ok: true; result: EngineAnalysisResult };
export type EngineRuntimeError = { ok: false; error: EngineRuntimeFailure };
export type EngineRuntimeEnvelope = EngineRuntimeSuccess | EngineRuntimeError;

const RETRYABLE_CODES = new Set<EngineRuntimeFailureCode>([
  'ENGINE_OVERLOADED',
  'ENGINE_QUEUE_TIMEOUT',
  'ENGINE_SEARCH_TIMEOUT',
  'ENGINE_TOTAL_TIMEOUT',
  'ENGINE_CRASHED',
  'ENGINE_POOL_UNAVAILABLE',
]);

const HTTP_STATUS_BY_CODE: Readonly<Record<EngineRuntimeFailureCode, number>> = {
  INVALID_POSITION: 400,
  ENGINE_ACTOR_LIMIT: 429,
  ENGINE_OVERLOADED: 503,
  ENGINE_QUEUE_TIMEOUT: 503,
  ENGINE_SEARCH_TIMEOUT: 504,
  ENGINE_TOTAL_TIMEOUT: 504,
  ENGINE_REQUEST_CANCELLED: 499,
  ENGINE_CRASHED: 503,
  ENGINE_PROTOCOL_ERROR: 502,
  ENGINE_POOL_UNAVAILABLE: 503,
};

const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LANE_SET = new Set<string>(ENGINE_RUNTIME_LANES);
const FAILURE_SET = new Set<string>(ENGINE_RUNTIME_FAILURE_CODES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isFiniteOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function isSearchLimits(value: unknown): value is EngineSearchLimits {
  if (!isRecord(value) || !hasOnlyKeys(value, ['depth', 'multiPv', 'timeoutMs'])) return false;
  return (
    isFiniteOptionalNumber(value.depth) &&
    isFiniteOptionalNumber(value.multiPv) &&
    isFiniteOptionalNumber(value.timeoutMs)
  );
}

export function parseEngineRuntimeRequest(value: unknown): EngineRuntimeRequest {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'schemaVersion',
      'correlationId',
      'engineFen',
      'lane',
      'limits',
      'remainingBudgetMs',
    ]) ||
    value.schemaVersion !== ENGINE_RUNTIME_REQUEST_SCHEMA ||
    typeof value.correlationId !== 'string' ||
    !CORRELATION_ID.test(value.correlationId) ||
    typeof value.engineFen !== 'string' ||
    typeof value.lane !== 'string' ||
    !LANE_SET.has(value.lane) ||
    !isSearchLimits(value.limits) ||
    typeof value.remainingBudgetMs !== 'number' ||
    !Number.isFinite(value.remainingBudgetMs) ||
    value.remainingBudgetMs <= 0
  ) {
    throw new EngineRuntimeContractError('invalid_engine_runtime_request');
  }

  return value as EngineRuntimeRequest;
}

export function runtimeFailure(code: EngineRuntimeFailureCode): EngineRuntimeFailure {
  return { code, retryable: RETRYABLE_CODES.has(code) };
}

export function runtimeFailureEnvelope(code: EngineRuntimeFailureCode): EngineRuntimeError {
  return { ok: false, error: runtimeFailure(code) };
}

export function runtimeHttpStatus(code: EngineRuntimeFailureCode): number {
  return HTTP_STATUS_BY_CODE[code];
}

export function runtimeRetryAfterSeconds(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.ceil(value)));
}

export function isEngineRuntimeFailure(value: unknown): value is EngineRuntimeFailure {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['code', 'retryable']) &&
    typeof value.code === 'string' &&
    FAILURE_SET.has(value.code) &&
    typeof value.retryable === 'boolean' &&
    value.retryable === RETRYABLE_CODES.has(value.code as EngineRuntimeFailureCode)
  );
}

export function parseEngineRuntimeEnvelope(value: unknown): EngineRuntimeEnvelope {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new EngineRuntimeContractError('invalid_engine_runtime_envelope');
  }
  if (value.ok === false) {
    if (!hasOnlyKeys(value, ['ok', 'error']) || !isEngineRuntimeFailure(value.error)) {
      throw new EngineRuntimeContractError('invalid_engine_runtime_failure');
    }
    return value as EngineRuntimeError;
  }
  if (!hasOnlyKeys(value, ['ok', 'result']) || !isEngineAnalysisResult(value.result)) {
    throw new EngineRuntimeContractError('invalid_engine_runtime_success');
  }
  return value as EngineRuntimeSuccess;
}

function isEngineAnalysisResult(value: unknown): value is EngineAnalysisResult {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'identity',
      'positionKey',
      'engineFen',
      'turn',
      'pov',
      'terminal',
      'bestMove',
      'lines',
      'limits',
    ]) ||
    !isRecord(value.identity) ||
    !hasOnlyKeys(value.identity, ['name', 'version']) ||
    value.identity.name !== 'stockfish' ||
    typeof value.identity.version !== 'string' ||
    value.identity.version.length < 1 ||
    value.identity.version.length > 128 ||
    typeof value.positionKey !== 'string' ||
    typeof value.engineFen !== 'string' ||
    !['w', 'b'].includes(String(value.turn)) ||
    value.pov !== 'white' ||
    typeof value.terminal !== 'boolean' ||
    (value.bestMove !== null && typeof value.bestMove !== 'string') ||
    !Array.isArray(value.lines) ||
    !isResultLimits(value.limits)
  ) {
    return false;
  }

  let position;
  try {
    position = parsePosition(value.engineFen);
  } catch {
    return false;
  }
  if (
    position.engineFen !== value.engineFen ||
    position.positionKey !== value.positionKey ||
    position.turn !== value.turn ||
    position.terminal !== value.terminal ||
    (value.bestMove !== null && !position.legalUciMoves.includes(value.bestMove.toLowerCase())) ||
    (position.terminal ? value.bestMove !== null : value.bestMove === null)
  ) {
    return false;
  }

  const ranks = new Set<number>();
  for (const line of value.lines) {
    if (!isEngineLine(line, position.engineFen) || ranks.has(line.rank)) return false;
    ranks.add(line.rank);
  }
  if (!position.terminal && (value.lines.length === 0 || !ranks.has(1))) return false;
  if (value.lines[0] && value.bestMove !== value.lines[0].move) return false;
  return true;
}

function isEngineLine(value: unknown, engineFen: string): value is EngineLine {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['rank', 'move', 'pv', 'score', 'depth', 'bound']) &&
    typeof value.rank === 'number' &&
    Number.isInteger(value.rank) &&
    value.rank >= 1 &&
    typeof value.move === 'string' &&
    Array.isArray(value.pv) &&
    value.pv.length > 0 &&
    value.pv.every((move) => typeof move === 'string') &&
    value.move === value.pv[0] &&
    isLegalUciPv(engineFen, value.pv as string[]) &&
    isEngineScore(value.score) &&
    typeof value.depth === 'number' &&
    Number.isInteger(value.depth) &&
    value.depth >= 0 &&
    (value.bound === null || value.bound === 'lower' || value.bound === 'upper')
  );
}

function isEngineScore(value: unknown): value is EngineScore {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'cp') {
    return hasOnlyKeys(value, ['kind', 'cp']) && typeof value.cp === 'number' && Number.isFinite(value.cp);
  }
  if (value.kind === 'mate') {
    return (
      hasOnlyKeys(value, ['kind', 'mate']) &&
      typeof value.mate === 'number' &&
      Number.isFinite(value.mate)
    );
  }
  return (
    value.kind === 'wdl' &&
    hasOnlyKeys(value, ['kind', 'win', 'draw', 'loss']) &&
    ['win', 'draw', 'loss'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key])
    )
  );
}

function isResultLimits(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['depth', 'multiPv', 'timeoutMs']) &&
    ['depth', 'multiPv', 'timeoutMs'].every(
      (key) =>
        typeof value[key] === 'number' && Number.isInteger(value[key]) && value[key] > 0
    )
  );
}

export class EngineRuntimeContractError extends Error {
  constructor(message = 'invalid_engine_runtime_contract') {
    super(message);
    this.name = 'EngineRuntimeContractError';
  }
}
