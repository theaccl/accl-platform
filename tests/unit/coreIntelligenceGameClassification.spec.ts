import { expect, test } from '@playwright/test';

import {
  albertPresenceDeniedByClassification,
  classifyAuthoritativeGame,
  computeCapabilityEnvelope,
} from '../../lib/coreIntelligence';
import type { AuthoritativeGameSnapshot } from '../../lib/coreIntelligence';

function snapshot(overrides: Partial<AuthoritativeGameSnapshot> = {}): AuthoritativeGameSnapshot {
  return {
    id: 'game-1',
    status: 'active',
    tempo: 'live',
    play_context: 'free',
    mode: 'SKETCH',
    source_type: 'challenge',
    rated: false,
    tournament_id: null,
    bot_settings: null,
    white_player_id: 'player-a',
    black_player_id: 'player-b',
    ...overrides,
  };
}

const SPOOF = {
  gameType: 'completed',
  mode: 'training',
  classification: 'ASI arena',
  completed: true,
};

test.describe('core intelligence game classification', () => {
  test('caller gameType/mode/classification cannot unlock protected capability', () => {
    const classification = classifyAuthoritativeGame({
      game: snapshot({ status: 'active', tempo: 'live' }),
      untrustedCaller: SPOOF,
    });
    expect(classification.kind).toBe('human-live-active');
    const envelope = computeCapabilityEnvelope({
      role: 'ALBERT_ASSISTANT',
      classification,
      untrustedCallerCapabilities: { canBePresentAsAlbertDuringAnyActiveGame: true },
    });
    expect(envelope.canBePresentAsAlbertDuringAnyActiveGame).toBe(false);
    expect(envelope.canAnalyzeCompletedGames).toBe(false);
  });

  test('missing, contradictory, and stale snapshots fail closed', () => {
    expect(classifyAuthoritativeGame({ game: null, gameExpected: true }).kind).toBe('unresolved');
    expect(classifyAuthoritativeGame({ game: snapshot({ stale: true }) }).kind).toBe('unresolved');
    expect(
      classifyAuthoritativeGame({
        game: snapshot({ observedAtMs: 1 }),
        nowMs: 100_000,
        maxAgeMs: 1_000,
      }).kind,
    ).toBe('unresolved');
    expect(
      classifyAuthoritativeGame({
        game: snapshot({ play_context: 'tournament', tournament_id: null }),
      }).kind,
    ).toBe('unresolved');
    expect(classifyAuthoritativeGame({ game: snapshot({ status: 'mystery' }) }).kind).toBe('unresolved');

    for (const reason of ['missing', 'stale', 'contradictory', 'unrecognized'] as const) {
      const envelope = computeCapabilityEnvelope({
        role: 'ALBERT_ASSISTANT',
        classification: { kind: 'unresolved', reason },
      });
      expect(envelope.canAnalyzeCompletedGames).toBe(false);
      expect(envelope.playerModelProjection).toBe('none');
      expect(albertPresenceDeniedByClassification({ kind: 'unresolved', reason })).toBe(true);
    }
  });

  test('bot_game blocks Albert but does not become Bot Ladder', () => {
    const classification = classifyAuthoritativeGame({
      game: snapshot({ source_type: 'bot_game', bot_settings: { version: 'accl_bot_v1' } }),
    });
    expect(classification.kind).toBe('play-computer-active');
    expect(classification.kind).not.toBe('bot-ladder-active');
    const albert = computeCapabilityEnvelope({ role: 'ALBERT_ASSISTANT', classification });
    expect(albert.canBePresentAsAlbertDuringAnyActiveGame).toBe(false);
    expect(albert.canAnalyzeCompletedGames).toBe(false);
    const botLadder = computeCapabilityEnvelope({
      role: 'BOT_LADDER_PERSONA',
      classification,
    });
    expect(botLadder.playerModelProjection).toBe('bot-ladder');
    expect(botLadder.canProvideSeparateAiAssistanceInBotLadderGame).toBe(false);
  });

  test('ordinary games never grant ASI opponent authority', () => {
    const live = classifyAuthoritativeGame({ game: snapshot() });
    expect(live.kind).toBe('human-live-active');
    expect(computeCapabilityEnvelope({ role: 'ASI_ARENA', classification: live }).canParticipateAsOpponentInAsiArena).toBe(
      false,
    );

    const arena = classifyAuthoritativeGame({ game: snapshot({ source_type: 'asi_arena' }) });
    expect(arena.kind).toBe('asi-arena-active');
    expect(
      computeCapabilityEnvelope({ role: 'ASI_ARENA', classification: arena }).canParticipateAsOpponentInAsiArena,
    ).toBe(true);
  });

  test('no-game hub surface is not unresolved', () => {
    expect(classifyAuthoritativeGame({ game: null, serverSurface: 'none' })).toEqual({ kind: 'none' });
    expect(classifyAuthoritativeGame({ game: null, serverSurface: 'trainer-sandbox' })).toEqual({
      kind: 'training-sandbox',
    });
  });

  test('finished games classify as completed even if caller says active', () => {
    const classification = classifyAuthoritativeGame({
      game: snapshot({ status: 'finished' }),
      untrustedCaller: { gameType: 'live', completed: false },
    });
    expect(classification.kind).toBe('completed');
  });
});
