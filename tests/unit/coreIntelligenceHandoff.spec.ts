import { expect, test } from '@playwright/test';

import {
  createRoleInstance,
  createSanitizedHandoffPacket,
  InMemoryHandoffNonceStore,
  transitionRoleSession,
} from '../../lib/coreIntelligence';

test.describe('core intelligence handoff', () => {
  test('persona transition creates a new role-session ID', async () => {
    const source = createRoleInstance({
      authenticatedPlayerId: 'player-a',
      role: 'ALBERT_ASSISTANT',
      classification: { kind: 'completed' },
      randomId: () => 'session-source',
    });
    const packet = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'TRAINER_PERSONA',
      reason: 'trainer_handoff',
      randomId: () => 'nonce-1',
    });
    const result = await transitionRoleSession({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      packet,
      classification: { kind: 'training-sandbox' },
      nonceStore: new InMemoryHandoffNonceStore(),
      randomId: () => 'session-dest',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.roleSessionId).toBe('session-dest');
    expect(result.session.roleSessionId).not.toBe(source.roleSessionId);
    expect(result.session.role).toBe('TRAINER_PERSONA');
  });

  test('destination envelope is freshly computed and does not inherit source privileges', async () => {
    const source = createRoleInstance({
      authenticatedPlayerId: 'player-a',
      role: 'ALBERT_ASSISTANT',
      classification: { kind: 'completed' },
    });
    expect(source.envelope.canAnalyzeCompletedGames).toBe(true);
    expect(source.envelope.playerModelProjection).toBe('coaching');

    const packet = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'ASI_ARENA',
      reason: 'arena',
    });
    const result = await transitionRoleSession({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      packet,
      classification: { kind: 'human-live-active' },
      nonceStore: new InMemoryHandoffNonceStore(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.envelope.playerModelProjection).toBe('none');
    expect(result.session.envelope.canAnalyzeCompletedGames).toBe(false);
    expect(result.session.envelope.canParticipateAsOpponentInAsiArena).toBe(false);
  });

  test('handoff carrying the wrong player ID is rejected', async () => {
    const source = createRoleInstance({
      authenticatedPlayerId: 'player-a',
      role: 'ALBERT_ASSISTANT',
      classification: { kind: 'none' },
    });
    const packet = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'TRAINER_PERSONA',
      reason: 'trainer_handoff',
    });
    const forged = { ...packet, playerId: 'player-b' };
    const result = await transitionRoleSession({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      packet: forged,
      classification: { kind: 'training-sandbox' },
      nonceStore: new InMemoryHandoffNonceStore(),
    });
    expect(result).toEqual({ ok: false, code: 'player_mismatch' });
  });

  test('stale and replayed handoffs are rejected', async () => {
    const source = createRoleInstance({
      authenticatedPlayerId: 'player-a',
      role: 'ALBERT_ASSISTANT',
      classification: { kind: 'none' },
    });
    const store = new InMemoryHandoffNonceStore();
    const packet = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'TRAINER_PERSONA',
      reason: 'trainer_handoff',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    const stale = await transitionRoleSession({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      packet,
      classification: { kind: 'none' },
      nonceStore: store,
      now: new Date('2026-01-01T01:00:00.000Z'),
      maxAgeMs: 60_000,
    });
    expect(stale).toEqual({ ok: false, code: 'stale' });

    const freshPacket = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'TRAINER_PERSONA',
      reason: 'trainer_handoff',
      now: new Date('2026-01-01T00:00:00.000Z'),
      randomId: () => 'nonce-replay',
    });
    const first = await transitionRoleSession({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      packet: freshPacket,
      classification: { kind: 'none' },
      nonceStore: store,
      now: new Date('2026-01-01T00:00:30.000Z'),
    });
    expect(first.ok).toBe(true);
    const replayed = await transitionRoleSession({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      packet: freshPacket,
      classification: { kind: 'none' },
      nonceStore: store,
      now: new Date('2026-01-01T00:00:31.000Z'),
    });
    expect(replayed).toEqual({ ok: false, code: 'replayed' });
  });
});
