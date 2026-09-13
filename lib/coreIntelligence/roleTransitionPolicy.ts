import { isCoreRole } from './roles';
import { PERSONA_DEFINITIONS } from './personaDefinition';
import type { CoreRole } from './types';

/**
 * Server-owned allowlist. Packet destination fields are never self-authorizing.
 * Same-role substitution is not a transition.
 */
export const AUTHORIZED_ROLE_TRANSITIONS: Readonly<Record<CoreRole, readonly CoreRole[]>> = {
  ALBERT_ASSISTANT: ['TRAINER_PERSONA', 'BOT_LADDER_PERSONA', 'ASI_ARENA'],
  TRAINER_PERSONA: ['ALBERT_ASSISTANT', 'BOT_LADDER_PERSONA', 'ASI_ARENA'],
  BOT_LADDER_PERSONA: ['ALBERT_ASSISTANT', 'TRAINER_PERSONA', 'ASI_ARENA'],
  ASI_ARENA: ['ALBERT_ASSISTANT', 'TRAINER_PERSONA'],
};

export function isAuthorizedRoleTransition(sourceRole: CoreRole, destinationRole: CoreRole): boolean {
  if (sourceRole === destinationRole) return false;
  return AUTHORIZED_ROLE_TRANSITIONS[sourceRole].includes(destinationRole);
}

export function personaMatchesDestinationRole(
  destinationRole: CoreRole,
  destinationPersonaId: string | null,
): boolean {
  if (!destinationPersonaId) return true;
  const persona = PERSONA_DEFINITIONS.find((entry) => entry.id === destinationPersonaId);
  return Boolean(persona && persona.role === destinationRole);
}

export type DestinationAuthorizationResult =
  | { ok: true; destinationRole: CoreRole; destinationPersonaId: string | null }
  | { ok: false; code: 'unauthorized_transition' | 'persona_mismatch' };

export function assertAuthorizedDestination(input: {
  sourceRole: CoreRole;
  authorizedDestinationRole: unknown;
  authorizedDestinationPersonaId?: string | null;
  packetDestinationRole: unknown;
  packetDestinationPersonaId: string | null;
}): DestinationAuthorizationResult {
  if (!isCoreRole(input.authorizedDestinationRole) || !isCoreRole(input.packetDestinationRole)) {
    return { ok: false, code: 'unauthorized_transition' };
  }
  if (input.authorizedDestinationRole !== input.packetDestinationRole) {
    return { ok: false, code: 'unauthorized_transition' };
  }
  const authorizedPersona = input.authorizedDestinationPersonaId?.trim()
    ? input.authorizedDestinationPersonaId.trim()
    : null;
  if (authorizedPersona !== input.packetDestinationPersonaId) {
    return { ok: false, code: 'unauthorized_transition' };
  }
  if (!isAuthorizedRoleTransition(input.sourceRole, input.authorizedDestinationRole)) {
    return { ok: false, code: 'unauthorized_transition' };
  }
  if (!personaMatchesDestinationRole(input.authorizedDestinationRole, authorizedPersona)) {
    return { ok: false, code: 'persona_mismatch' };
  }
  return {
    ok: true,
    destinationRole: input.authorizedDestinationRole,
    destinationPersonaId: authorizedPersona,
  };
}
