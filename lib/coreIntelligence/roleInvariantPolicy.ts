import type { CapabilityBooleanKey, CapabilityEnvelope, CoreRole, PlayerModelProjection } from './types';

export type RoleInvariantFloor = {
  forceFalse: readonly CapabilityBooleanKey[];
  forceProjection: PlayerModelProjection | null;
};

/**
 * Server-owned, role-indexed never-floors. Request-time policy cannot override these.
 * Changing a floor requires a doctrine/architecture change and test update.
 */
export const ROLE_INVARIANT_FLOORS = {
  ALBERT_ASSISTANT: {
    forceFalse: [
      'canBePresentAsAlbertDuringAnyActiveGame',
      'canCoachOrAnalyzeHumanLiveGame',
      'canCoachOrAnalyzeHumanCorrespondenceGame',
      'canProvideSeparateAiAssistanceInBotLadderGame',
      'canParticipateAsOpponentInAsiArena',
      'canSelfLearnInSandbox',
    ],
    forceProjection: null,
  },
  TRAINER_PERSONA: {
    forceFalse: [
      'canBePresentAsAlbertDuringAnyActiveGame',
      'canCoachOrAnalyzeHumanLiveGame',
      'canCoachOrAnalyzeHumanCorrespondenceGame',
      'canProvideSeparateAiAssistanceInBotLadderGame',
      'canParticipateAsOpponentInAsiArena',
      'canSelfLearnInSandbox',
    ],
    forceProjection: null,
  },
  BOT_LADDER_PERSONA: {
    forceFalse: [
      'canBePresentAsAlbertDuringAnyActiveGame',
      'canCoachOrAnalyzeHumanLiveGame',
      'canCoachOrAnalyzeHumanCorrespondenceGame',
      'canProvideSeparateAiAssistanceInBotLadderGame',
      'canParticipateAsOpponentInAsiArena',
      'canSelfLearnInSandbox',
    ],
    forceProjection: null,
  },
  ASI_ARENA: {
    forceFalse: [
      'canBePresentAsAlbertDuringAnyActiveGame',
      'canCoachOrAnalyzeHumanLiveGame',
      'canCoachOrAnalyzeHumanCorrespondenceGame',
      'canProvideSeparateAiAssistanceInBotLadderGame',
      'canAnalyzeCompletedGames',
      'canAccessTrainingPositions',
    ],
    forceProjection: 'none' as const,
  },
} as const satisfies Record<CoreRole, RoleInvariantFloor>;

export function applyRoleInvariantFloors(role: CoreRole, envelope: CapabilityEnvelope): CapabilityEnvelope {
  const floor = ROLE_INVARIANT_FLOORS[role];
  const next: CapabilityEnvelope = { ...envelope };
  for (const key of floor.forceFalse) {
    next[key] = false;
  }
  if (floor.forceProjection) {
    next.playerModelProjection = floor.forceProjection;
  }
  return next;
}
