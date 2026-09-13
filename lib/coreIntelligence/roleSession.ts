import { randomUUID } from 'node:crypto';

import { computeCapabilityEnvelope } from './computeCapabilityEnvelope';
import type { CoreRole, GameClassification, RoleInstance } from './types';

export type CreateRoleInstanceInput = {
  authenticatedPlayerId: string;
  role: CoreRole;
  personaId?: string | null;
  classification: GameClassification;
  now?: Date;
  randomId?: () => string;
  /** Ignored. Identity is authenticatedPlayerId only. */
  untrustedPlayerId?: unknown;
};

export function createRoleInstance(input: CreateRoleInstanceInput): RoleInstance {
  const playerId = String(input.authenticatedPlayerId ?? '').trim();
  if (!playerId) {
    throw new Error('authenticated_player_required');
  }
  void input.untrustedPlayerId;
  const createdAt = (input.now ?? new Date()).toISOString();
  const roleSessionId = (input.randomId ?? randomUUID)();
  const envelope = computeCapabilityEnvelope({
    role: input.role,
    classification: input.classification,
  });
  return Object.freeze({
    playerId,
    role: input.role,
    personaId: input.personaId?.trim() ? input.personaId.trim() : null,
    roleSessionId,
    createdAt,
    envelope: Object.freeze({ ...envelope }),
  });
}
