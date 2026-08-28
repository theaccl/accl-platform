import { applyRoleInvariantFloors } from './roleInvariantPolicy';
import { defaultProjectionForRole } from './roles';
import { isActiveGameClassification, isHumanLiveOrCorrespondenceClassification } from './gameClassification';
import type { CapabilityEnvelope, CoreRole, GameClassification } from './types';

export function closedCapabilityEnvelope(): CapabilityEnvelope {
  return {
    playerModelProjection: 'none',
    canAnalyzeCompletedGames: false,
    canAccessTrainingPositions: false,
    canCoachOrAnalyzeHumanLiveGame: false,
    canCoachOrAnalyzeHumanCorrespondenceGame: false,
    canProvideSeparateAiAssistanceInBotLadderGame: false,
    canBePresentAsAlbertDuringAnyActiveGame: false,
    canParticipateAsOpponentInAsiArena: false,
    canUseCompetitionEngine: false,
    canSelfLearnInSandbox: false,
  };
}

export type ComputeCapabilityEnvelopeInput = {
  role: CoreRole;
  classification: GameClassification;
  /** Untrusted. Never merged into the authoritative envelope. */
  untrustedCallerCapabilities?: unknown;
};

/**
 * Capability envelopes are computed server-side from role + authoritative classification.
 * Caller-supplied capability-shaped objects are ignored.
 */
export function computeCapabilityEnvelope(input: ComputeCapabilityEnvelopeInput): CapabilityEnvelope {
  void input.untrustedCallerCapabilities;
  const closed = closedCapabilityEnvelope();

  if (input.classification.kind === 'unresolved') {
    return applyRoleInvariantFloors(input.role, closed);
  }

  const next: CapabilityEnvelope = {
    ...closed,
    playerModelProjection: defaultProjectionForRole(input.role),
  };
  const kind = input.classification.kind;
  const active = isActiveGameClassification(input.classification);
  const humanGame = isHumanLiveOrCorrespondenceClassification(input.classification);

  if (input.role === 'ALBERT_ASSISTANT' && !active) {
    next.canAnalyzeCompletedGames = kind === 'completed' || kind === 'none';
    next.canAccessTrainingPositions = kind === 'training-sandbox' || kind === 'none';
  }

  if (input.role === 'TRAINER_PERSONA' && !active && !humanGame) {
    next.canAnalyzeCompletedGames = kind === 'completed' || kind === 'none';
    next.canAccessTrainingPositions =
      kind === 'training-sandbox' || kind === 'none' || kind === 'completed';
  }

  if (input.role === 'ASI_ARENA' && kind === 'asi-arena-active') {
    next.canParticipateAsOpponentInAsiArena = true;
    next.canSelfLearnInSandbox = true;
    next.canUseCompetitionEngine = true;
  }

  return applyRoleInvariantFloors(input.role, next);
}

export function albertPresenceDeniedByClassification(classification: GameClassification): boolean {
  if (classification.kind === 'unresolved') return true;
  return isActiveGameClassification(classification);
}
