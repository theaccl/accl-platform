import { randomUUID } from 'node:crypto';

import { createRoleInstance } from './roleSession';
import type {
  CoreRole,
  GameClassification,
  HandoffPacket,
  RoleInstance,
} from './types';

/**
 * Durable replay consumption belongs in a persistence-backed store.
 * Process-local memory is not production-grade in a serverless runtime.
 */
export type HandoffNonceStore = {
  hasConsumed(nonce: string): boolean | Promise<boolean>;
  consume(nonce: string): void | Promise<void>;
};

/** Process-local only. Not a durable Slice 1 persistence implementation. */
export class InMemoryHandoffNonceStore implements HandoffNonceStore {
  private readonly consumed = new Set<string>();

  hasConsumed(nonce: string): boolean {
    return this.consumed.has(nonce);
  }

  consume(nonce: string): void {
    this.consumed.add(nonce);
  }
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
  return Object.freeze({
    playerId,
    destinationRole: input.destinationRole,
    destinationPersonaId: input.destinationPersonaId?.trim() ? input.destinationPersonaId.trim() : null,
    reason: String(input.reason ?? '').trim() || 'role_transition',
    lessonOrTaskContext: input.lessonOrTaskContext?.trim() ? input.lessonOrTaskContext.trim() : null,
    permittedPlayerModelRefs: Object.freeze([...(input.permittedPlayerModelRefs ?? [])]),
    completedGameOrTrainingIds: Object.freeze([...(input.completedGameOrTrainingIds ?? [])]),
    issuedAt: (input.now ?? new Date()).toISOString(),
    nonce: (input.randomId ?? randomUUID)(),
  });
}

export type TransitionRoleInput = {
  authenticatedPlayerId: string;
  sourceSession: RoleInstance;
  packet: HandoffPacket;
  classification: GameClassification;
  nonceStore: HandoffNonceStore;
  now?: Date;
  maxAgeMs?: number;
  randomId?: () => string;
};

export type TransitionRoleResult =
  | { ok: true; session: RoleInstance; packet: HandoffPacket }
  | { ok: false; code: 'player_mismatch' | 'stale' | 'replayed' | 'source_mismatch' };

export async function transitionRoleSession(input: TransitionRoleInput): Promise<TransitionRoleResult> {
  const authenticated = String(input.authenticatedPlayerId ?? '').trim();
  if (!authenticated) return { ok: false, code: 'player_mismatch' };
  if (input.sourceSession.playerId !== authenticated) return { ok: false, code: 'source_mismatch' };
  if (input.packet.playerId !== authenticated) return { ok: false, code: 'player_mismatch' };

  const now = input.now ?? new Date();
  const issuedAtMs = Date.parse(input.packet.issuedAt);
  const maxAgeMs = input.maxAgeMs ?? 5 * 60 * 1000;
  if (!Number.isFinite(issuedAtMs) || now.getTime() - issuedAtMs > maxAgeMs) {
    return { ok: false, code: 'stale' };
  }

  if (await input.nonceStore.hasConsumed(input.packet.nonce)) {
    return { ok: false, code: 'replayed' };
  }
  await input.nonceStore.consume(input.packet.nonce);

  const session = createRoleInstance({
    authenticatedPlayerId: authenticated,
    role: input.packet.destinationRole,
    personaId: input.packet.destinationPersonaId,
    classification: input.classification,
    now,
    randomId: input.randomId,
  });

  return { ok: true, session, packet: input.packet };
}
