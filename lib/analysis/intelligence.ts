import { runEngineAnalysis, runHeuristicAnalysis } from './analyze';
import { sanitizeAnalysisRows } from './classify';
import { StockfishWebAdapter } from './engine';
import type {
  AntiCheatEnforcementStore,
  EffectiveEnforcementState,
  EnforcementState,
} from './enforcementStore';
import { assertValidEnforcementBaseline, EnforcementEvidenceInvalidError } from './enforcementStore';
import { configForMode, type IntelligenceMode } from './modes';
import { validateFenOrThrow } from './validate';
import type { AnalyzedMove } from './types';
import type { AntiCheatEventStore, AntiCheatSignalCounts, SuspicionTrend } from './antiCheatStore';
import { AntiCheatEvidenceInvalidError, MAX_INTEGRITY_SIGNAL_COUNT } from './antiCheatStore';
import type { ModeratorQueuePayload, ModeratorQueueSink } from './moderatorQueue';

export type IntegrityResponseLevel = 'FULL' | 'GUIDED' | 'RESTRICTED' | 'BLOCKED';
export type IntegrityContextType =
  | 'active-rated-game'
  | 'active-tournament-game'
  | 'active-unrated-free-play-game'
  | 'completed-game-review'
  | 'training-mode';

export type IntegrityContext = {
  type: IntegrityContextType;
  // Relevant for active unrated/free-play integrity policy checks.
  liveHumanVsHuman?: boolean;
  // Explicit user consent mode for free-play guidance.
  explicitConsentMode?: boolean;
};

export type TruthPayload = {
  rows: AnalyzedMove[];
  engine?: {
    best_move: string;
    candidate_moves: string[];
    confidence: number;
    depth: number;
  };
  mode: IntelligenceMode;
  tablebaseHook: null;
  openingDbHook: null;
};

export type IntegrityRefusalReason =
  | 'active-rated-game-protected'
  | 'active-tournament-game-protected'
  | 'free-play-human-vs-human-consent-required'
  | 'confirmed-overlap-protected-context'
  | 'active-game-overlap-protected'
  | 'limited-analysis-enforced'
  | 'trainer-locked-enforced'
  | 'review-locked-enforced';

export type IntegrityPolicyVerdict = {
  responseLevel: IntegrityResponseLevel;
  refusalReason?: IntegrityRefusalReason;
};

export type IntegrityAuditLog = {
  requestContext: IntegrityContext;
  policyVerdict: IntegrityPolicyVerdict;
  engineCalled: boolean;
  responseLevel: IntegrityResponseLevel;
  refusalReason?: IntegrityRefusalReason;
  antiCheat: AntiCheatMetadata;
  recommendation: ActionRecommendation;
  enforcement: {
    state: EnforcementState;
    source: 'baseline' | 'override';
    baselineState: EnforcementState;
    overrideAction: 'CLEAR_RESTRICTION' | 'TEMPORARY_UNLOCK' | 'KEEP_LOCKED_PENDING_REVIEW' | null;
  };
  moderatorQueuePayload: ModeratorQueuePayload | null;
};

export type OverlapVerdict = 'CLEAR' | 'BOOK_OVERLAP' | 'NOVELTY_COLLISION' | 'CONFIRMED_OVERLAP';

export type OverlapInput = {
  activeGameFen?: string;
  activeGameMoves?: string[];
  requestMoves?: string[];
  repeatedProbeCount?: number;
  requestMarker?: string;
  signalCounts?: Partial<{
    confirmedOverlap: number;
    noveltyCollision: number;
    protectedOverlapAttempt: number;
    blockedLiveProtectedRequest: number;
    blockedRequest: number;
    probingBurst: number;
    openingBookOverlap: number;
  }>;
  lastSignalAtEpochMs?: number;
};

export type SuspicionSignalStrength = 'weak' | 'medium' | 'strong';
export type SuspicionTier =
  | 'CLEAR'
  | 'WATCH'
  | 'WARNING'
  | 'SOFT_LOCK_RECOMMENDED'
  | 'ESCALATE_REVIEW';

export type SuspicionReason = {
  signal: string;
  strength: SuspicionSignalStrength;
  weight: number;
  occurrences: number;
  requestMarker?: string;
  timestampEpochMs?: number;
  overlapVerdict: OverlapVerdict;
  protectedContext: boolean;
};

export type SuspicionResult = {
  score: number;
  tier: SuspicionTier;
  reasons: SuspicionReason[];
  decayFactor: number;
};

type SuspicionSignal = {
  signal: string;
  strength: SuspicionSignalStrength;
  baseWeight: number;
  occurrences: number;
};

export type OverlapEvaluation = {
  verdict: OverlapVerdict;
  fingerprints: {
    requestPositionId: string;
    activePositionId: string | null;
    requestMoveSequenceId: string;
    activeMoveSequenceId: string | null;
  };
  matchSummary: {
    positionMatch: boolean;
    matchedPrefixPlies: number;
    openingTolerancePlies: number;
    noveltyThresholdPlies: number;
    repeatedProbeCount: number;
  };
  protectedContext: boolean;
  blockedByOverlap: boolean;
  suspicion: SuspicionResult;
};

export type AntiCheatMetadata = OverlapEvaluation;

export type RecommendedAction =
  | 'NO_ACTION'
  | 'MONITOR'
  | 'FLAG_ACCOUNT'
  | 'RESTRICT_ANALYSIS_ACCESS'
  | 'SEND_TO_MODERATOR_QUEUE';

export type ActionRecommendation = {
  recommended_action: RecommendedAction;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  supporting_reasons: SuspicionReason[];
};

export type IntegrityControlledTruthResponse =
  | {
      ok: true;
      responseLevel: Exclude<IntegrityResponseLevel, 'BLOCKED'>;
      truth: TruthPayload;
      refusal: null;
      audit: IntegrityAuditLog;
    }
  | {
      ok: false;
      responseLevel: 'BLOCKED';
      truth: null;
      refusal: {
        code: 'INTEGRITY_BLOCKED' | 'ENFORCEMENT_RESTRICTED';
        reason: IntegrityRefusalReason;
        message: string;
      };
      audit: IntegrityAuditLog;
    };

export class ChessTruthError extends Error {
  code: 'INVALID_FEN' | 'ENGINE_TIMEOUT' | 'ENGINE_CRASH';
  constructor(code: 'INVALID_FEN' | 'ENGINE_TIMEOUT' | 'ENGINE_CRASH') {
    super(code);
    this.code = code;
    this.name = 'ChessTruthError';
  }
}

export type IntegrityControlFailureCode =
  | 'ANTI_CHEAT_HISTORY_UNAVAILABLE'
  | 'ANTI_CHEAT_EVIDENCE_INVALID'
  | 'ENFORCEMENT_UNAVAILABLE'
  | 'ANTI_CHEAT_AUDIT_UNAVAILABLE'
  | 'MODERATOR_QUEUE_UNAVAILABLE';

export class IntegrityControlUnavailableError extends Error {
  constructor(readonly code: IntegrityControlFailureCode, options?: ErrorOptions) {
    super(code, options);
    this.name = 'IntegrityControlUnavailableError';
  }
}

const MAX_INTEGRITY_MOVES = 1_024;
const MAX_INTEGRITY_MOVE_LENGTH = 64;
const MAX_INTEGRITY_MARKER_LENGTH = 128;

function assertBoundedCount(value: unknown): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_INTEGRITY_SIGNAL_COUNT
  ) {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
  }
}

function validateSignalCounts(counts: AntiCheatSignalCounts | undefined): AntiCheatSignalCounts | undefined {
  if (!counts) return undefined;
  for (const value of Object.values(counts)) {
    if (value !== undefined) assertBoundedCount(value);
  }
  const blockedLive = counts.blockedLiveProtectedRequest ?? 0;
  if (
    blockedLive > (counts.protectedOverlapAttempt ?? 0) ||
    blockedLive > (counts.blockedRequest ?? 0)
  ) {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
  }
  return counts;
}

function validateOverlapEvidence(overlap: OverlapInput | undefined): OverlapInput | undefined {
  if (!overlap) return undefined;
  if (overlap.activeGameFen !== undefined) {
    if (typeof overlap.activeGameFen !== 'string' || overlap.activeGameFen.length > 256) {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    }
    try {
      validateFenOrThrow(overlap.activeGameFen);
    } catch {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    }
  }
  for (const moves of [overlap.activeGameMoves, overlap.requestMoves]) {
    if (!moves) continue;
    if (moves.length > MAX_INTEGRITY_MOVES) {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    }
    if (moves.some((move) => typeof move !== 'string' || move.length === 0 || move.length > MAX_INTEGRITY_MOVE_LENGTH)) {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    }
  }
  if (overlap.repeatedProbeCount !== undefined) assertBoundedCount(overlap.repeatedProbeCount);
  if (
    overlap.requestMarker !== undefined &&
    (typeof overlap.requestMarker !== 'string' || overlap.requestMarker.length > MAX_INTEGRITY_MARKER_LENGTH)
  ) {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
  }
  if (
    overlap.lastSignalAtEpochMs !== undefined &&
    (!Number.isFinite(overlap.lastSignalAtEpochMs) || overlap.lastSignalAtEpochMs < 0)
  ) {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
  }
  validateSignalCounts(overlap.signalCounts);
  return overlap;
}

function validateEffectiveEnforcement(
  value: EffectiveEnforcementState,
  expectedUserId: string
): EffectiveEnforcementState {
  const states = new Set<EnforcementState>([
    'NO_RESTRICTION',
    'MONITOR_ONLY',
    'LIMITED_ANALYSIS',
    'TRAINER_LOCKED',
    'REVIEW_LOCKED',
  ]);
  if (
    !value ||
    value.userId !== expectedUserId ||
    !states.has(value.state) ||
    !states.has(value.baselineState) ||
    (value.source !== 'baseline' && value.source !== 'override') ||
    (value.source === 'baseline' && value.state !== value.baselineState)
  ) {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
  }
  if (value.source === 'override') {
    const overrideState = {
      CLEAR_RESTRICTION: 'NO_RESTRICTION',
      TEMPORARY_UNLOCK: 'MONITOR_ONLY',
      KEEP_LOCKED_PENDING_REVIEW: 'REVIEW_LOCKED',
    } as const;
    if (!value.overrideAction || overrideState[value.overrideAction] !== value.state) {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    }
    const expiry = value.overrideExpiresAt;
    if (
      (value.overrideAction === 'TEMPORARY_UNLOCK' && !expiry) ||
      (expiry != null && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()))
    ) {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    }
  }
  try {
    assertValidEnforcementBaseline(value.baselineState, value.sourceSuspicionTier, value.sourceRecommendedAction);
  } catch {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
  }
  return value;
}

function stableFingerprint(input: string): string {
  // Deterministic, fast, non-cryptographic hash for integrity matching.
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fp_${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeFenForComparison(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  const board = parts[0] ?? '';
  const side = parts[1] ?? 'w';
  const castling = parts[2] ?? '-';
  const enPassant = parts[3] ?? '-';
  // Ignore halfmove/fullmove counters to prevent false mismatches.
  return [board, side, castling, enPassant].join(' ');
}

export function createPositionFingerprint(fen: string): string {
  return stableFingerprint(normalizeFenForComparison(fen));
}

function normalizeSanToken(san: string): string {
  return san.trim().replace(/\s+/g, '').toLowerCase();
}

export function createMoveSequenceFingerprint(moves: string[]): string {
  const normalized = (moves ?? []).map((move) => normalizeSanToken(move)).join('|');
  return stableFingerprint(normalized);
}

function matchedPrefixPlies(a: string[], b: string[]): number {
  const limit = Math.min(a.length, b.length);
  let matched = 0;
  for (let i = 0; i < limit; i += 1) {
    if (normalizeSanToken(a[i] ?? '') !== normalizeSanToken(b[i] ?? '')) break;
    matched += 1;
  }
  return matched;
}

function isProtectedLiveContext(context: IntegrityContext): boolean {
  return (
    context.type === 'active-rated-game' ||
    context.type === 'active-tournament-game' ||
    context.type === 'active-unrated-free-play-game'
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveSuspicionTier(score: number): SuspicionTier {
  if (score >= 65) return 'ESCALATE_REVIEW';
  if (score >= 45) return 'SOFT_LOCK_RECOMMENDED';
  if (score >= 30) return 'WARNING';
  if (score >= 15) return 'WATCH';
  return 'CLEAR';
}

function evaluateSuspicion(input: {
  overlapVerdict: OverlapVerdict;
  protectedContext: boolean;
  blockedByOverlap: boolean;
  matchedPrefixPlies: number;
  noveltyThresholdPlies: number;
  repeatedProbeCount: number;
  signalCounts?: OverlapInput['signalCounts'];
  nowEpochMs: number;
  lastSignalAtEpochMs?: number;
  requestMarker?: string;
}): SuspicionResult {
  const historical = input.signalCounts ?? {};
  const signals: SuspicionSignal[] = [];

  const addSignal = (
    signal: string,
    strength: SuspicionSignalStrength,
    baseWeight: number,
    occurrences: number
  ) => {
    if (occurrences <= 0) return;
    signals.push({ signal, strength, baseWeight, occurrences });
  };

  if (input.overlapVerdict === 'BOOK_OVERLAP' || (historical.openingBookOverlap ?? 0) > 0) {
    addSignal('opening_book_overlap', 'weak', 2, Math.max(input.overlapVerdict === 'BOOK_OVERLAP' ? 1 : 0, historical.openingBookOverlap ?? 0));
  }
  if (input.overlapVerdict === 'NOVELTY_COLLISION' || (historical.noveltyCollision ?? 0) > 0) {
    addSignal('novelty_collision', 'medium', 6, Math.max(input.overlapVerdict === 'NOVELTY_COLLISION' ? 1 : 0, historical.noveltyCollision ?? 0));
  }
  if (input.overlapVerdict === 'CONFIRMED_OVERLAP' || (historical.confirmedOverlap ?? 0) > 0) {
    addSignal('confirmed_overlap', 'strong', 12, Math.max(input.overlapVerdict === 'CONFIRMED_OVERLAP' ? 1 : 0, historical.confirmedOverlap ?? 0));
  }
  if ((input.protectedContext && input.overlapVerdict !== 'CLEAR') || (historical.protectedOverlapAttempt ?? 0) > 0) {
    addSignal(
      'protected_context_overlap_attempt',
      'strong',
      14,
      Math.max(1, historical.protectedOverlapAttempt ?? 1)
    );
  }
  if ((input.blockedByOverlap && input.protectedContext) || (historical.blockedLiveProtectedRequest ?? 0) > 0) {
    addSignal(
      'blocked_live_protected_request',
      'strong',
      16,
      Math.max(1, historical.blockedLiveProtectedRequest ?? 1)
    );
  }
  if (historical.blockedRequest && historical.blockedRequest > 0) {
    addSignal('blocked_request_pattern', 'medium', 9, historical.blockedRequest);
  }
  if (input.repeatedProbeCount >= 3) {
    addSignal(
      'repeated_probing',
      input.repeatedProbeCount >= 6 ? 'strong' : 'medium',
      input.repeatedProbeCount >= 6 ? 10 : 7,
      Math.max(input.repeatedProbeCount, historical.probingBurst ?? 0)
    );
  }
  if (
    input.overlapVerdict !== 'CONFIRMED_OVERLAP' &&
    input.matchedPrefixPlies >= input.noveltyThresholdPlies
  ) {
    addSignal('deep_prefix_collision', 'weak', 4, 1);
  }

  const ageMs = input.lastSignalAtEpochMs ? Math.max(0, input.nowEpochMs - input.lastSignalAtEpochMs) : 0;
  const decayHalfLifeMs = 30 * 60 * 1000;
  const rawDecay = input.lastSignalAtEpochMs ? Math.pow(0.5, ageMs / decayHalfLifeMs) : 1;
  const decayFactor = clamp(rawDecay, 0.35, 1);

  const reasons = signals.map((s) => {
    const protectedMultiplier = input.protectedContext ? 1.25 : 1;
    const recencyMultiplier = decayFactor;
    const overlapGuardrailMultiplier =
      s.signal === 'opening_book_overlap' && !input.protectedContext ? 0.7 : 1;
    // Common opening history remains weak evidence even after many reviews.
    // Keep the actual count in the audit without allowing it alone to lock access.
    const scoredOccurrences = s.signal === 'opening_book_overlap' ? Math.min(s.occurrences, 1) : s.occurrences;
    const weighted = Math.round(
      s.baseWeight * scoredOccurrences * protectedMultiplier * recencyMultiplier * overlapGuardrailMultiplier
    );
    return {
      signal: s.signal,
      strength: s.strength,
      weight: weighted,
      occurrences: s.occurrences,
      requestMarker: input.requestMarker,
      timestampEpochMs: input.nowEpochMs,
      overlapVerdict: input.overlapVerdict,
      protectedContext: input.protectedContext,
    };
  });

  const score = reasons.reduce((total, reason) => total + reason.weight, 0);
  return {
    score,
    tier: resolveSuspicionTier(score),
    reasons: score > 0 ? reasons : [],
    decayFactor,
  };
}

export function recommendationForSuspicion(input: SuspicionResult): ActionRecommendation {
  switch (input.tier) {
    case 'CLEAR':
      return {
        recommended_action: 'NO_ACTION',
        severity: 'none',
        supporting_reasons: input.reasons,
      };
    case 'WATCH':
      return {
        recommended_action: 'MONITOR',
        severity: 'low',
        supporting_reasons: input.reasons,
      };
    case 'WARNING':
      return {
        recommended_action: 'FLAG_ACCOUNT',
        severity: 'medium',
        supporting_reasons: input.reasons,
      };
    case 'SOFT_LOCK_RECOMMENDED':
      return {
        recommended_action: 'RESTRICT_ANALYSIS_ACCESS',
        severity: 'high',
        supporting_reasons: input.reasons,
      };
    case 'ESCALATE_REVIEW':
      return {
        recommended_action: 'SEND_TO_MODERATOR_QUEUE',
        severity: 'critical',
        supporting_reasons: input.reasons,
      };
  }
}

function mergeSignalCounts(
  historical: AntiCheatSignalCounts | undefined,
  runtime: OverlapInput['signalCounts'] | undefined
): OverlapInput['signalCounts'] {
  validateSignalCounts(historical);
  validateSignalCounts(runtime);
  if (!historical && !runtime) return undefined;
  const out: Required<AntiCheatSignalCounts> = {
    confirmedOverlap: 0,
    noveltyCollision: 0,
    protectedOverlapAttempt: 0,
    blockedLiveProtectedRequest: 0,
    blockedRequest: 0,
    probingBurst: 0,
    openingBookOverlap: 0,
  };
  const keys = Object.keys(out) as (keyof AntiCheatSignalCounts)[];
  for (const key of keys) {
    const h = historical?.[key] ?? 0;
    const r = runtime?.[key] ?? 0;
    // Runtime evidence may confirm, but must never subtract from or double-count
    // the durable history maintained by the server-owned event ledger.
    out[key] = Math.max(h, r);
  }
  return out;
}

async function persistAntiCheatEvent(input: {
  antiCheatStore?: AntiCheatEventStore;
  userId?: string | null;
  gameId?: string | null;
  fen: string;
  overlap: OverlapEvaluation;
  context: IntegrityContext;
  responseLevel: IntegrityResponseLevel;
  refusalReason?: IntegrityRefusalReason;
  engineCalled: boolean;
  trend: SuspicionTrend | null;
  recommendation: ActionRecommendation;
  moderatorQueuePayload: ModeratorQueuePayload | null;
  required: boolean;
}): Promise<void> {
  if (!input.antiCheatStore || !input.userId) {
    if (input.required) {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_AUDIT_UNAVAILABLE');
    }
    return;
  }
  try {
    await input.antiCheatStore.appendEvent({
      user_id: input.userId,
      game_id: input.gameId ?? null,
      fen: input.fen,
      overlap_verdict: input.overlap.verdict,
      suspicion_score: input.overlap.suspicion.score,
      suspicion_tier: input.overlap.suspicion.tier,
      reasons_json: input.overlap.suspicion.reasons,
      protected_context: input.overlap.protectedContext,
      engine_called: input.engineCalled,
      request_context: {
        context_type: input.context.type,
        requestContext: input.context,
        protectedContext: input.overlap.protectedContext,
        engineCalled: input.engineCalled,
        overlapVerdict: input.overlap.verdict,
        suspicion: input.overlap.suspicion,
        recommendation: input.recommendation,
        moderatorQueuePayload: input.moderatorQueuePayload,
        responseLevel: input.responseLevel,
        refusalReason: input.refusalReason,
        trend: input.trend,
      },
    });
  } catch (error) {
    if (input.required) {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_AUDIT_UNAVAILABLE', { cause: error });
    }
  }
}

function buildModeratorQueuePayload(input: {
  userId?: string | null;
  gameId?: string | null;
  overlap: OverlapEvaluation;
  recommendation: ActionRecommendation;
  nowEpochMs: number;
}): ModeratorQueuePayload | null {
  if (!input.userId) return null;
  const tier = input.overlap.suspicion.tier;
  if (tier !== 'SOFT_LOCK_RECOMMENDED' && tier !== 'ESCALATE_REVIEW') return null;
  return {
    user_id: input.userId,
    game_id: input.gameId ?? null,
    suspicion_tier: tier,
    suspicion_score: input.overlap.suspicion.score,
    recommended_action: input.recommendation.recommended_action,
    supporting_reasons: input.recommendation.supporting_reasons,
    overlap_verdict: input.overlap.verdict,
    created_at: new Date(input.nowEpochMs).toISOString(),
  };
}

async function persistModeratorQueue(input: {
  payload: ModeratorQueuePayload | null;
  sink?: ModeratorQueueSink;
  required: boolean;
}): Promise<void> {
  if (!input.payload) return;
  if (!input.sink) {
    if (input.required) {
      throw new IntegrityControlUnavailableError('MODERATOR_QUEUE_UNAVAILABLE');
    }
    return;
  }
  try {
    await input.sink.enqueue(input.payload);
  } catch (error) {
    if (input.required) {
      throw new IntegrityControlUnavailableError('MODERATOR_QUEUE_UNAVAILABLE', { cause: error });
    }
  }
}

export function evaluateOverlap(input: {
  requestFen: string;
  context: IntegrityContext;
  overlap?: OverlapInput;
  nowEpochMs?: number;
  /** Server-owned completed-review gate; never accepted by the HTTP parser. */
  protectActiveGameOverlap?: boolean;
}): OverlapEvaluation {
  const openingTolerancePlies = 8;
  const noveltyThresholdPlies = 14;
  const repeatedProbeCount = input.overlap?.repeatedProbeCount ?? 0;

  const requestPositionId = createPositionFingerprint(input.requestFen);
  const activePositionId = input.overlap?.activeGameFen
    ? createPositionFingerprint(input.overlap.activeGameFen)
    : null;

  const requestMoves = input.overlap?.requestMoves ?? [];
  const activeMoves = input.overlap?.activeGameMoves ?? [];

  const requestMoveSequenceId = createMoveSequenceFingerprint(requestMoves);
  const activeMoveSequenceId = input.overlap?.activeGameMoves
    ? createMoveSequenceFingerprint(activeMoves)
    : null;

  const positionMatch = Boolean(activePositionId) && requestPositionId === activePositionId;
  const matchedPrefix = matchedPrefixPlies(requestMoves, activeMoves);

  let verdict: OverlapVerdict = 'CLEAR';
  if (matchedPrefix > 0 && matchedPrefix <= openingTolerancePlies) {
    verdict = 'BOOK_OVERLAP';
  } else if (positionMatch && matchedPrefix >= noveltyThresholdPlies) {
    verdict = 'CONFIRMED_OVERLAP';
  } else if (positionMatch || matchedPrefix >= noveltyThresholdPlies || repeatedProbeCount >= 3) {
    verdict = 'NOVELTY_COLLISION';
  }

  const protectedReview = input.protectActiveGameOverlap === true && Boolean(input.overlap?.activeGameFen);
  // A different completed position sharing ordinary opening moves is tolerated.
  // Exact live positions (including book positions) still receive the full gate.
  const protectedContext = isProtectedLiveContext(input.context) ||
    (protectedReview && (positionMatch || (verdict !== 'CLEAR' && verdict !== 'BOOK_OVERLAP')));
  const blockedByOverlap = (protectedContext && verdict === 'CONFIRMED_OVERLAP') ||
    (protectedReview && positionMatch);
  const suspicion = evaluateSuspicion({
    overlapVerdict: verdict,
    protectedContext,
    blockedByOverlap,
    matchedPrefixPlies: matchedPrefix,
    noveltyThresholdPlies,
    repeatedProbeCount,
    signalCounts: input.overlap?.signalCounts,
    nowEpochMs: input.nowEpochMs ?? Date.now(),
    lastSignalAtEpochMs: input.overlap?.lastSignalAtEpochMs,
    requestMarker: input.overlap?.requestMarker,
  });

  return {
    verdict,
    fingerprints: {
      requestPositionId,
      activePositionId,
      requestMoveSequenceId,
      activeMoveSequenceId,
    },
    matchSummary: {
      positionMatch,
      matchedPrefixPlies: matchedPrefix,
      openingTolerancePlies,
      noveltyThresholdPlies,
      repeatedProbeCount,
    },
    protectedContext,
    blockedByOverlap,
    suspicion,
  };
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // Ignore timeout cleanup errors; timeout classification still wins.
      }
      reject(new ChessTruthError('ENGINE_TIMEOUT'));
    }, timeoutMs);
    task
      .then((result) => resolve(result))
      .catch((err) => reject(err))
      .finally(() => clearTimeout(timer));
  });
}

export async function getChessTruth(input: {
  fen: string;
  mode: IntelligenceMode;
}): Promise<TruthPayload> {
  return getChessTruthForMoves({ ...input, moves: [] });
}

export async function getChessTruthForMoves(input: {
  fen: string;
  mode: IntelligenceMode;
  moves: { san: string }[];
  adapter?: StockfishWebAdapter;
}): Promise<TruthPayload> {
  try {
    validateFenOrThrow(input.fen);
  } catch {
    throw new ChessTruthError('INVALID_FEN');
  }

  const moves = input.moves ?? [];
  const cfg = configForMode(input.mode);
  const adapter = input.adapter ?? new StockfishWebAdapter();

  try {
    const raw = cfg.useEngine
      ? await withTimeout(
          runEngineAnalysis({
            adapter,
            fen: input.fen,
            depth: cfg.depth,
            multiPv: cfg.multiPv,
            moves,
          }),
          cfg.timeoutMs,
          () => {
            adapter.dispose?.();
          }
        )
      : await runHeuristicAnalysis(moves);

    return {
      rows: sanitizeAnalysisRows(raw.rows, cfg.depth),
      engine: raw.engine,
      mode: input.mode,
      // Future integration hooks (intentionally null for now).
      tablebaseHook: null,
      openingDbHook: null,
    };
  } catch (err) {
    if (err instanceof ChessTruthError) throw err;
    throw new ChessTruthError('ENGINE_CRASH');
  } finally {
    adapter.dispose?.();
  }
}

export function evaluateIntegrityPolicy(context: IntegrityContext): IntegrityPolicyVerdict {
  switch (context.type) {
    case 'active-rated-game':
      return {
        responseLevel: 'BLOCKED',
        refusalReason: 'active-rated-game-protected',
      };
    case 'active-tournament-game':
      return {
        responseLevel: 'BLOCKED',
        refusalReason: 'active-tournament-game-protected',
      };
    case 'training-mode':
    case 'completed-game-review':
      return { responseLevel: 'FULL' };
    case 'active-unrated-free-play-game':
      if (context.liveHumanVsHuman && !context.explicitConsentMode) {
        return {
          responseLevel: 'BLOCKED',
          refusalReason: 'free-play-human-vs-human-consent-required',
        };
      }
      return { responseLevel: context.explicitConsentMode ? 'GUIDED' : 'RESTRICTED' };
  }
}

export async function getIntegrityControlledTruth(input: {
  fen: string;
  mode: IntelligenceMode;
  context: IntegrityContext;
  overlap?: OverlapInput;
  nowEpochMs?: number;
  userId?: string | null;
  gameId?: string | null;
  antiCheatStore?: AntiCheatEventStore;
  enforcementStore?: AntiCheatEnforcementStore;
  moderatorQueueSink?: ModeratorQueueSink;
  requireDurableControls?: boolean;
  trendLookbackEvents?: number;
  trendWindowMinutes?: number;
  // Dependency injection hook for deterministic tests.
  truthProvider?: (arg: { fen: string; mode: IntelligenceMode }) => Promise<TruthPayload>;
}): Promise<IntegrityControlledTruthResponse> {
  const requireDurableControls = input.requireDurableControls === true;
  if (requireDurableControls && (!input.userId || !input.antiCheatStore)) {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_HISTORY_UNAVAILABLE');
  }
  if (requireDurableControls && !input.enforcementStore) {
    throw new IntegrityControlUnavailableError('ENFORCEMENT_UNAVAILABLE');
  }
  const nowEpochMs = input.nowEpochMs ?? Date.now();
  const trendWindowMinutes = input.trendWindowMinutes ?? 60;
  const sinceIso = new Date(nowEpochMs - trendWindowMinutes * 60 * 1000).toISOString();
  let historyCounts: AntiCheatSignalCounts | undefined;
  let recentTrend: SuspicionTrend | null = null;
  const serverOverlap = validateOverlapEvidence(input.overlap);
  let lastSignalAtEpochMs = serverOverlap?.lastSignalAtEpochMs;
  if (input.antiCheatStore && input.userId) {
    try {
      const [counts, recent, trend] = await Promise.all([
        input.antiCheatStore.countRecentSignalsByUser(input.userId, sinceIso),
        input.antiCheatStore.listRecentEventsByUser(input.userId, 1),
        input.antiCheatStore.computeRollingSuspicionTrendByUser(input.userId, input.trendLookbackEvents ?? 20),
      ]);
      historyCounts = validateSignalCounts(counts);
      const latest = recent[0]?.created_at ? Date.parse(recent[0].created_at) : Number.NaN;
      if (recent[0]?.created_at && !Number.isFinite(latest)) {
        throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
      }
      if (Number.isFinite(latest)) lastSignalAtEpochMs = latest;
      if (
        ![trend.latest, trend.oldest, trend.average, trend.delta].every((value) =>
          Number.isFinite(value)
        )
      ) {
        throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
      }
      recentTrend = trend;
    } catch (error) {
      if (error instanceof IntegrityControlUnavailableError) throw error;
      if (error instanceof AntiCheatEvidenceInvalidError) {
        throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID', { cause: error });
      }
      if (requireDurableControls) {
        throw new IntegrityControlUnavailableError('ANTI_CHEAT_HISTORY_UNAVAILABLE', { cause: error });
      }
    }
  }

  const hydratedOverlap: OverlapInput | undefined = serverOverlap || historyCounts
    ? {
        ...serverOverlap,
        repeatedProbeCount: Math.max(
          serverOverlap?.repeatedProbeCount ?? 0,
          historyCounts?.probingBurst ?? 0
        ),
        signalCounts: mergeSignalCounts(historyCounts, serverOverlap?.signalCounts),
        lastSignalAtEpochMs,
      }
    : undefined;

  const overlap = evaluateOverlap({
    requestFen: input.fen,
    context: input.context,
    overlap: hydratedOverlap,
    nowEpochMs,
    protectActiveGameOverlap: requireDurableControls && input.context.type === 'completed-game-review',
  });
  const recommendation = recommendationForSuspicion(overlap.suspicion);
  let enforcement: IntegrityAuditLog['enforcement'] = {
    state: 'NO_RESTRICTION',
    source: 'baseline',
    baselineState: 'NO_RESTRICTION',
    overrideAction: null,
  };
  if (input.enforcementStore && input.userId) {
    try {
      const existing = validateEffectiveEnforcement(
        await input.enforcementStore.getEffectiveState(input.userId),
        input.userId
      );
      const rank: Record<EnforcementState, number> = {
        NO_RESTRICTION: 0,
        MONITOR_ONLY: 1,
        LIMITED_ANALYSIS: 2,
        TRAINER_LOCKED: 3,
        REVIEW_LOCKED: 4,
      };
      const recommendedRank: Record<SuspicionTier, number> = {
        CLEAR: 0,
        WATCH: 1,
        WARNING: 2,
        SOFT_LOCK_RECOMMENDED: 3,
        ESCALATE_REVIEW: 4,
      };
      if (recommendedRank[overlap.suspicion.tier] >= rank[existing.baselineState]) {
        await input.enforcementStore.upsertFromRecommendation({
          userId: input.userId,
          suspicionTier: overlap.suspicion.tier,
          recommendation,
          reasonJson: overlap.suspicion.reasons,
        });
        enforcement = validateEffectiveEnforcement(
          await input.enforcementStore.getEffectiveState(input.userId),
          input.userId
        );
      } else {
        enforcement = existing;
      }
    } catch (error) {
      if (error instanceof EnforcementEvidenceInvalidError) {
        throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID', { cause: error });
      }
      if (error instanceof IntegrityControlUnavailableError) throw error;
      if (requireDurableControls) {
        throw new IntegrityControlUnavailableError('ENFORCEMENT_UNAVAILABLE', { cause: error });
      }
    }
  }
  const moderatorQueuePayload = buildModeratorQueuePayload({
    userId: input.userId,
    gameId: input.gameId,
    overlap,
    recommendation,
    nowEpochMs,
  });
  const verdict = evaluateIntegrityPolicy(input.context);
  const finalVerdict: IntegrityPolicyVerdict = overlap.blockedByOverlap
    ? {
        responseLevel: 'BLOCKED',
        refusalReason: input.context.type === 'completed-game-review'
          ? 'active-game-overlap-protected'
          : 'confirmed-overlap-protected-context',
      }
    : verdict;

  const baseAudit: IntegrityAuditLog = {
    requestContext: input.context,
    policyVerdict: finalVerdict,
    engineCalled: false,
    responseLevel: finalVerdict.responseLevel,
    refusalReason: finalVerdict.refusalReason,
    antiCheat: overlap,
    recommendation,
    enforcement,
    moderatorQueuePayload,
  };

  if (enforcement.state === 'LIMITED_ANALYSIS') {
    await persistAntiCheatEvent({
      antiCheatStore: input.antiCheatStore,
      userId: input.userId,
      gameId: input.gameId,
      fen: input.fen,
      overlap,
      context: input.context,
      responseLevel: 'RESTRICTED',
      refusalReason: 'limited-analysis-enforced',
      engineCalled: false,
      trend: recentTrend,
      recommendation,
      moderatorQueuePayload,
      required: requireDurableControls,
    });
    await persistModeratorQueue({
      payload: moderatorQueuePayload,
      sink: input.moderatorQueueSink,
      required: requireDurableControls,
    });
    return {
      ok: false,
      responseLevel: 'BLOCKED',
      truth: null,
      refusal: {
        code: 'ENFORCEMENT_RESTRICTED',
        reason: 'limited-analysis-enforced',
        message: 'Analysis is temporarily limited by anti-cheat enforcement.',
      },
      audit: baseAudit,
    };
  }
  if (enforcement.state === 'TRAINER_LOCKED') {
    await persistAntiCheatEvent({
      antiCheatStore: input.antiCheatStore,
      userId: input.userId,
      gameId: input.gameId,
      fen: input.fen,
      overlap,
      context: input.context,
      responseLevel: 'RESTRICTED',
      refusalReason: 'trainer-locked-enforced',
      engineCalled: false,
      trend: recentTrend,
      recommendation,
      moderatorQueuePayload,
      required: requireDurableControls,
    });
    await persistModeratorQueue({
      payload: moderatorQueuePayload,
      sink: input.moderatorQueueSink,
      required: requireDurableControls,
    });
    return {
      ok: false,
      responseLevel: 'BLOCKED',
      truth: null,
      refusal: {
        code: 'ENFORCEMENT_RESTRICTED',
        reason: 'trainer-locked-enforced',
        message: 'Trainer and protected analysis access are temporarily locked.',
      },
      audit: baseAudit,
    };
  }
  if (enforcement.state === 'REVIEW_LOCKED') {
    await persistAntiCheatEvent({
      antiCheatStore: input.antiCheatStore,
      userId: input.userId,
      gameId: input.gameId,
      fen: input.fen,
      overlap,
      context: input.context,
      responseLevel: 'RESTRICTED',
      refusalReason: 'review-locked-enforced',
      engineCalled: false,
      trend: recentTrend,
      recommendation,
      moderatorQueuePayload,
      required: requireDurableControls,
    });
    await persistModeratorQueue({
      payload: moderatorQueuePayload,
      sink: input.moderatorQueueSink,
      required: requireDurableControls,
    });
    return {
      ok: false,
      responseLevel: 'BLOCKED',
      truth: null,
      refusal: {
        code: 'ENFORCEMENT_RESTRICTED',
        reason: 'review-locked-enforced',
        message: 'Protected analysis is blocked pending moderator review.',
      },
      audit: baseAudit,
    };
  }

  if (finalVerdict.responseLevel === 'BLOCKED') {
    await persistAntiCheatEvent({
      antiCheatStore: input.antiCheatStore,
      userId: input.userId,
      gameId: input.gameId,
      fen: input.fen,
      overlap,
      context: input.context,
      responseLevel: finalVerdict.responseLevel,
      refusalReason: finalVerdict.refusalReason,
      engineCalled: false,
      trend: recentTrend,
      recommendation,
      moderatorQueuePayload,
      required: requireDurableControls,
    });
    await persistModeratorQueue({
      payload: moderatorQueuePayload,
      sink: input.moderatorQueueSink,
      required: requireDurableControls,
    });
    return {
      ok: false,
      responseLevel: 'BLOCKED',
      truth: null,
      refusal: {
        code: 'INTEGRITY_BLOCKED',
        reason: finalVerdict.refusalReason!,
        message: 'Analysis is blocked for the current gameplay context.',
      },
      audit: baseAudit,
    };
  }

  const truthProvider = input.truthProvider ?? getChessTruth;
  const truth = await truthProvider({
    fen: input.fen,
    mode: input.mode,
  });

  await persistAntiCheatEvent({
    antiCheatStore: input.antiCheatStore,
    userId: input.userId,
    gameId: input.gameId,
    fen: input.fen,
    overlap,
    context: input.context,
    responseLevel: finalVerdict.responseLevel,
    refusalReason: finalVerdict.refusalReason,
    engineCalled: true,
    trend: recentTrend,
    recommendation,
    moderatorQueuePayload,
    required: requireDurableControls,
  });
  await persistModeratorQueue({
    payload: moderatorQueuePayload,
    sink: input.moderatorQueueSink,
    required: requireDurableControls,
  });

  return {
    ok: true,
    responseLevel: finalVerdict.responseLevel,
    truth,
    refusal: null,
    audit: {
      ...baseAudit,
      engineCalled: true,
    },
  };
}
