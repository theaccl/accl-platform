import { randomUUID } from 'node:crypto';

import { PERSONA_DEFINITIONS } from './personaDefinition';
import { createRoleInstance } from './roleSession';
import { assertAuthorizedDestination, isAuthorizedRoleTransition } from './roleTransitionPolicy';
import type {
  CoreRole,
  GameClassification,
  HandoffPacket,
  RoleInstance,
} from './types';

export const DEFAULT_HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;
export const DEFAULT_HANDOFF_MAX_FUTURE_SKEW_MS = 5_000;

/**
 * Atomic nonce consumption. Exactly one caller may succeed for a given nonce.
 * Process-local adapters are not durable across serverless isolates.
 */
export type HandoffNonceStore = {
  consumeOnce(nonce: string): boolean | Promise<boolean>;
};

/** Process-local only. Atomic within one isolate; not durable across instances. */
export class InMemoryHandoffNonceStore implements HandoffNonceStore {
  private readonly consumed = new Set<string>();

  consumeOnce(nonce: string): boolean {
    const value = String(nonce ?? '').trim();
    if (!value) return false;
    if (this.consumed.has(value)) return false;
    this.consumed.add(value);
    return true;
  }
}

export type HandoffCarriedContext = {
  lessonOrTaskContext: string | null;
  permittedPlayerModelRefs: readonly string[];
  completedGameOrTrainingIds: readonly string[];
};

/** Destination-role sanitization. ASI never carries coaching or Player Model context. */
export function sanitizeCarriedHandoffContext(
  destinationRole: CoreRole,
  context: HandoffCarriedContext,
): HandoffCarriedContext {
  if (destinationRole === 'ASI_ARENA') {
    return {
      lessonOrTaskContext: null,
      permittedPlayerModelRefs: Object.freeze([]),
      completedGameOrTrainingIds: Object.freeze([]),
    };
  }
  return {
    lessonOrTaskContext: context.lessonOrTaskContext?.trim() ? context.lessonOrTaskContext.trim() : null,
    permittedPlayerModelRefs: Object.freeze([...context.permittedPlayerModelRefs]),
    completedGameOrTrainingIds: Object.freeze([...context.completedGameOrTrainingIds]),
  };
}

export type CreateHandoffPacketInput = {
  authenticatedPlayerId: string;
  sourceSession: RoleInstance;
  destinationRole: CoreRole;
  destinationPersonaId?: string | null;
  reason: string;
  lessonOrTaskContext?: string | null;
  permittedPlayerModelRefs?: readonly string[];
  completedGameOrTrainingIds?: readonly string[];
  now?: Date;
  randomId?: () => string;
};

export function createSanitizedHandoffPacket(input: CreateHandoffPacketInput): HandoffPacket {
  const playerId = String(input.authenticatedPlayerId ?? '').trim();
  if (!playerId || playerId !== input.sourceSession.playerId) {
    throw new Error('handoff_player_mismatch');
  }
  if (!isAuthorizedRoleTransition(input.sourceSession.role, input.destinationRole)) {
    throw new Error('handoff_unauthorized_transition');
  }
  const destinationPersonaId = input.destinationPersonaId?.trim() ? input.destinationPersonaId.trim() : null;
  if (destinationPersonaId) {
    const persona = PERSONA_DEFINITIONS.find((entry) => entry.id === destinationPersonaId);
    if (!persona || persona.role !== input.destinationRole) {
      throw new Error('handoff_persona_mismatch');
    }
  }
  const nonce = String((input.randomId ?? randomUUID)() ?? '').trim();
  if (!nonce) throw new Error('handoff_invalid_nonce');
  const carried = sanitizeCarriedHandoffContext(input.destinationRole, {
    lessonOrTaskContext: input.lessonOrTaskContext ?? null,
    permittedPlayerModelRefs: input.permittedPlayerModelRefs ?? [],
    completedGameOrTrainingIds: input.completedGameOrTrainingIds ?? [],
  });
  return Object.freeze({
    playerId,
    sourceRole: input.sourceSession.role,
    sourceRoleSessionId: input.sourceSession.roleSessionId,
    destinationRole: input.destinationRole,
    destinationPersonaId,
    reason: String(input.reason ?? '').trim() || 'role_transition',
    lessonOrTaskContext: carried.lessonOrTaskContext,
    permittedPlayerModelRefs: carried.permittedPlayerModelRefs,
    completedGameOrTrainingIds: carried.completedGameOrTrainingIds,
    issuedAt: (input.now ?? new Date()).toISOString(),
    nonce,
  });
}

export type TransitionRoleInput = {
  authenticatedPlayerId: string;
  sourceSession: RoleInstance;
  packet: HandoffPacket;
  classification: GameClassification;
  nonceStore: HandoffNonceStore;
  authorizedDestinationRole: CoreRole;
  authorizedDestinationPersonaId?: string | null;
  now?: Date;
  maxAgeMs?: number;
  maxFutureSkewMs?: number;
  randomId?: () => string;
};

export type TransitionRoleResult =
  | { ok: true; session: RoleInstance; packet: HandoffPacket }
  | {
      ok: false;
      code:
        | 'player_mismatch'
        | 'stale'
        | 'future'
        | 'replayed'
        | 'source_mismatch'
        | 'unauthorized_transition'
        | 'invalid_packet'
        | 'persona_mismatch';
    };

function validatePacketFreshness(input: {
  issuedAt: string;
  nonce: string;
  nowMs: number;
  maxAgeMs: number;
  maxFutureSkewMs: number;
}): Extract<TransitionRoleResult, { ok: false }> | null {
  const nonce = String(input.nonce ?? '').trim();
  if (!nonce) return { ok: false, code: 'invalid_packet' };
  if (!Number.isFinite(input.maxAgeMs) || input.maxAgeMs <= 0) return { ok: false, code: 'invalid_packet' };
  if (!Number.isFinite(input.maxFutureSkewMs) || input.maxFutureSkewMs < 0) {
    return { ok: false, code: 'invalid_packet' };
  }
  const issuedAtMs = Date.parse(input.issuedAt);
  if (!Number.isFinite(issuedAtMs)) return { ok: false, code: 'invalid_packet' };
  const ageMs = input.nowMs - issuedAtMs;
  if (ageMs < -input.maxFutureSkewMs) return { ok: false, code: 'future' };
  if (ageMs > input.maxAgeMs) return { ok: false, code: 'stale' };
  return null;
}

export async function transitionRoleSession(input: TransitionRoleInput): Promise<TransitionRoleResult> {
  const authenticated = String(input.authenticatedPlayerId ?? '').trim();
  if (!authenticated) return { ok: false, code: 'player_mismatch' };
  if (input.sourceSession.playerId !== authenticated) return { ok: false, code: 'source_mismatch' };
  if (input.packet.playerId !== authenticated) return { ok: false, code: 'player_mismatch' };
  if (input.packet.sourceRole !== input.sourceSession.role) return { ok: false, code: 'source_mismatch' };
  if (input.packet.sourceRoleSessionId !== input.sourceSession.roleSessionId) {
    return { ok: false, code: 'source_mismatch' };
  }

  const authorized = assertAuthorizedDestination({
    sourceRole: input.sourceSession.role,
    authorizedDestinationRole: input.authorizedDestinationRole,
    authorizedDestinationPersonaId: input.authorizedDestinationPersonaId ?? null,
    packetDestinationRole: input.packet.destinationRole,
    packetDestinationPersonaId: input.packet.destinationPersonaId,
  });
  if (!authorized.ok) return { ok: false, code: authorized.code };

  const now = input.now ?? new Date();
  const freshness = validatePacketFreshness({
    issuedAt: input.packet.issuedAt,
    nonce: input.packet.nonce,
    nowMs: now.getTime(),
    maxAgeMs: input.maxAgeMs ?? DEFAULT_HANDOFF_MAX_AGE_MS,
    maxFutureSkewMs: input.maxFutureSkewMs ?? DEFAULT_HANDOFF_MAX_FUTURE_SKEW_MS,
  });
  if (freshness) return freshness;

  const consumed = await input.nonceStore.consumeOnce(input.packet.nonce);
  if (!consumed) return { ok: false, code: 'replayed' };

  const session = createRoleInstance({
    authenticatedPlayerId: authenticated,
    role: authorized.destinationRole,
    personaId: authorized.destinationPersonaId,
    classification: input.classification,
    now,
    randomId: input.randomId,
  });

  const sanitizedPacket = Object.freeze({
    ...input.packet,
    destinationRole: authorized.destinationRole,
    destinationPersonaId: authorized.destinationPersonaId,
    ...sanitizeCarriedHandoffContext(authorized.destinationRole, {
      lessonOrTaskContext: input.packet.lessonOrTaskContext,
      permittedPlayerModelRefs: input.packet.permittedPlayerModelRefs,
      completedGameOrTrainingIds: input.packet.completedGameOrTrainingIds,
    }),
  });

  return { ok: true, session, packet: sanitizedPacket };
}
