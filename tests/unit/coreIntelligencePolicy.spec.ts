import { expect, test } from '@playwright/test';

import {
  computeCapabilityEnvelope,
  defaultProjectionForRole,
} from '../../lib/coreIntelligence';
import type { CapabilityEnvelope, GameClassification } from '../../lib/coreIntelligence';

const ALL_TRUE_CAPABILITIES: CapabilityEnvelope = {
  playerModelProjection: 'coaching',
  canAnalyzeCompletedGames: true,
  canAccessTrainingPositions: true,
  canCoachOrAnalyzeHumanLiveGame: true,
  canCoachOrAnalyzeHumanCorrespondenceGame: true,
  canProvideSeparateAiAssistanceInBotLadderGame: true,
  canBePresentAsAlbertDuringAnyActiveGame: true,
  canParticipateAsOpponentInAsiArena: true,
  canUseCompetitionEngine: true,
  canSelfLearnInSandbox: true,
};

function envelope(role: Parameters<typeof computeCapabilityEnvelope>[0]['role'], classification: GameClassification) {
  return computeCapabilityEnvelope({
    role,
    classification,
    untrustedCallerCapabilities: ALL_TRUE_CAPABILITIES,
  });
}

test.describe('core intelligence policy', () => {
  test('caller-supplied capability booleans cannot elevate authority', () => {
    const result = envelope('ALBERT_ASSISTANT', { kind: 'human-live-active' });
    expect(result.canBePresentAsAlbertDuringAnyActiveGame).toBe(false);
    expect(result.canCoachOrAnalyzeHumanLiveGame).toBe(false);
    expect(result.canProvideSeparateAiAssistanceInBotLadderGame).toBe(false);
    expect(result.canParticipateAsOpponentInAsiArena).toBe(false);
    expect(result.canSelfLearnInSandbox).toBe(false);
  });

  test('immutable role floor cannot be flipped true at request time', () => {
    const albert = envelope('ALBERT_ASSISTANT', { kind: 'none' });
    expect(albert.canBePresentAsAlbertDuringAnyActiveGame).toBe(false);
    expect(albert.canCoachOrAnalyzeHumanLiveGame).toBe(false);
    expect(albert.canCoachOrAnalyzeHumanCorrespondenceGame).toBe(false);

    const trainer = envelope('TRAINER_PERSONA', { kind: 'none' });
    expect(trainer.canCoachOrAnalyzeHumanLiveGame).toBe(false);
    expect(trainer.canCoachOrAnalyzeHumanCorrespondenceGame).toBe(false);
    expect(trainer.canProvideSeparateAiAssistanceInBotLadderGame).toBe(false);
  });

  test('ASI projection is always none', () => {
    const kinds: GameClassification[] = [
      { kind: 'none' },
      { kind: 'completed' },
      { kind: 'asi-arena-active' },
      { kind: 'human-live-active' },
      { kind: 'unresolved', reason: 'missing' },
    ];
    for (const classification of kinds) {
      expect(envelope('ASI_ARENA', classification).playerModelProjection).toBe('none');
      expect(defaultProjectionForRole('ASI_ARENA')).toBe('none');
    }
  });

  test('ASI opponent authority is arena-only', () => {
    expect(envelope('ASI_ARENA', { kind: 'asi-arena-active' }).canParticipateAsOpponentInAsiArena).toBe(true);
    expect(envelope('ASI_ARENA', { kind: 'human-live-active' }).canParticipateAsOpponentInAsiArena).toBe(false);
    expect(envelope('ASI_ARENA', { kind: 'play-computer-active' }).canParticipateAsOpponentInAsiArena).toBe(false);
    expect(envelope('ALBERT_ASSISTANT', { kind: 'asi-arena-active' }).canParticipateAsOpponentInAsiArena).toBe(false);
  });

  test('Albert is blocked for every active game classification', () => {
    const active: GameClassification[] = [
      { kind: 'bot-ladder-active' },
      { kind: 'asi-arena-active' },
      { kind: 'human-live-active' },
      { kind: 'human-correspondence-active' },
      { kind: 'human-daily-active' },
      { kind: 'play-computer-active' },
      { kind: 'other-active' },
    ];
    for (const classification of active) {
      const result = envelope('ALBERT_ASSISTANT', classification);
      expect(result.canBePresentAsAlbertDuringAnyActiveGame).toBe(false);
      expect(result.canAnalyzeCompletedGames).toBe(false);
      expect(result.canCoachOrAnalyzeHumanLiveGame).toBe(false);
      expect(result.canCoachOrAnalyzeHumanCorrespondenceGame).toBe(false);
      expect(result.canProvideSeparateAiAssistanceInBotLadderGame).toBe(false);
    }
  });

  test('Albert Bot-Ladder block and correspondence block', () => {
    const botLadder = envelope('ALBERT_ASSISTANT', { kind: 'bot-ladder-active' });
    expect(botLadder.canProvideSeparateAiAssistanceInBotLadderGame).toBe(false);
    expect(botLadder.canBePresentAsAlbertDuringAnyActiveGame).toBe(false);

    const correspondence = envelope('ALBERT_ASSISTANT', { kind: 'human-correspondence-active' });
    expect(correspondence.canCoachOrAnalyzeHumanCorrespondenceGame).toBe(false);
    expect(correspondence.canAnalyzeCompletedGames).toBe(false);
  });

  test('Trainer cannot coach human live or correspondence games', () => {
    for (const kind of ['human-live-active', 'human-correspondence-active', 'human-daily-active'] as const) {
      const result = envelope('TRAINER_PERSONA', { kind });
      expect(result.canCoachOrAnalyzeHumanLiveGame).toBe(false);
      expect(result.canCoachOrAnalyzeHumanCorrespondenceGame).toBe(false);
      expect(result.canAnalyzeCompletedGames).toBe(false);
    }
  });

  test('active Bot-Ladder games grant no separate Trainer or Albert assistance', () => {
    const trainer = envelope('TRAINER_PERSONA', { kind: 'bot-ladder-active' });
    expect(trainer.canProvideSeparateAiAssistanceInBotLadderGame).toBe(false);
    expect(trainer.canAccessTrainingPositions).toBe(false);
    expect(trainer.canAnalyzeCompletedGames).toBe(false);

    const albert = envelope('ALBERT_ASSISTANT', { kind: 'bot-ladder-active' });
    expect(albert.canProvideSeparateAiAssistanceInBotLadderGame).toBe(false);
  });

  test('Bot Ladder and Trainer lanes cannot silently interchange', () => {
    const trainer = envelope('TRAINER_PERSONA', { kind: 'bot-ladder-active' });
    const botLadder = envelope('BOT_LADDER_PERSONA', { kind: 'bot-ladder-active' });
    expect(trainer.playerModelProjection).toBe('training');
    expect(botLadder.playerModelProjection).toBe('bot-ladder');
    expect(trainer.playerModelProjection).not.toBe(botLadder.playerModelProjection);
    expect(envelope('TRAINER_PERSONA', { kind: 'none' }).playerModelProjection).not.toBe('bot-ladder');
    expect(envelope('BOT_LADDER_PERSONA', { kind: 'training-sandbox' }).playerModelProjection).not.toBe('training');
  });
});
