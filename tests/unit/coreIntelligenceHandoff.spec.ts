import { expect, test } from '@playwright/test';

import {
  createRoleInstance,
  createSanitizedHandoffPacket,
  InMemoryHandoffNonceStore,
  isAuthorizedRoleTransition,
  sanitizeCarriedHandoffContext,
  transitionRoleSession,
} from '../../lib/coreIntelligence';
import type { HandoffPacket, RoleInstance } from '../../lib/coreIntelligence';

function transitionArgs(
  source: RoleInstance,
  packet: HandoffPacket,
  extras: Partial<Parameters<typeof transitionRoleSession>[0]> = {},
) {
  return {
    authenticatedPlayerId: 'player-a',
    sourceSession: source,
    packet,
    classification: { kind: 'none' as const },
    nonceStore: extras.nonceStore ?? new InMemoryHandoffNonceStore(),
    authorizedDestinationRole: packet.destinationRole,
    authorizedDestinationPersonaId: packet.destinationPersonaId,
    ...extras,
  };
}

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
    const result = await transitionRoleSession(
      transitionArgs(source, packet, { classification: { kind: 'training-sandbox' }, randomId: () => 'session-dest' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.roleSessionId).toBe('session-dest');
    expect(result.session.roleSessionId).not.toBe(source.roleSessionId);
    expect(result.session.role).toBe('TRAINER_PERSONA');
    expect(packet.sourceRole).toBe('ALBERT_ASSISTANT');
    expect(packet.sourceRoleSessionId).toBe('session-source');
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
    const result = await transitionRoleSession(
      transitionArgs(source, packet, { classification: { kind: 'human-live-active' } }),
    );
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
    const result = await transitionRoleSession(transitionArgs(source, forged));
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

    const stale = await transitionRoleSession(
      transitionArgs(source, packet, {
        nonceStore: store,
        now: new Date('2026-01-01T01:00:00.000Z'),
        maxAgeMs: 60_000,
      }),
    );
    expect(stale).toEqual({ ok: false, code: 'stale' });

    const freshPacket = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'TRAINER_PERSONA',
      reason: 'trainer_handoff',
      now: new Date('2026-01-01T00:00:00.000Z'),
      randomId: () => 'nonce-replay',
    });
    const first = await transitionRoleSession(
      transitionArgs(source, freshPacket, {
        nonceStore: store,
        now: new Date('2026-01-01T00:00:30.000Z'),
      }),
    );
    expect(first.ok).toBe(true);
    const replayed = await transitionRoleSession(
      transitionArgs(source, freshPacket, {
        nonceStore: store,
        now: new Date('2026-01-01T00:00:31.000Z'),
      }),
    );
    expect(replayed).toEqual({ ok: false, code: 'replayed' });
  });

  test('ASI packets cannot carry coaching context or Player Model references', async () => {
    const source = createRoleInstance({
      authenticatedPlayerId: 'player-a',
      role: 'ALBERT_ASSISTANT',
      classification: { kind: 'completed' },
    });
    const packet = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'ASI_ARENA',
      reason: 'arena',
      lessonOrTaskContext: 'private coaching notes about the Sicilian',
      permittedPlayerModelRefs: ['player-a-coaching-view'],
      completedGameOrTrainingIds: ['game-secret'],
    });
    expect(packet.lessonOrTaskContext).toBeNull();
    expect(packet.permittedPlayerModelRefs).toEqual([]);
    expect(packet.completedGameOrTrainingIds).toEqual([]);

    const forged = {
      ...packet,
      lessonOrTaskContext: 'leaked coaching',
      permittedPlayerModelRefs: ['player-a-coaching-view'],
      completedGameOrTrainingIds: ['game-secret'],
    };
    const result = await transitionRoleSession(
      transitionArgs(source, forged, { classification: { kind: 'asi-arena-active' } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packet.lessonOrTaskContext).toBeNull();
    expect(result.packet.permittedPlayerModelRefs).toEqual([]);
    expect(result.packet.completedGameOrTrainingIds).toEqual([]);
    expect(result.session.envelope.playerModelProjection).toBe('none');
    expect(
      sanitizeCarriedHandoffContext('ASI_ARENA', {
        lessonOrTaskContext: 'still private',
        permittedPlayerModelRefs: ['x'],
        completedGameOrTrainingIds: ['y'],
      }),
    ).toEqual({
      lessonOrTaskContext: null,
      permittedPlayerModelRefs: [],
      completedGameOrTrainingIds: [],
    });
  });

  test('atomic consumeOnce allows only one concurrent transition for the same nonce', async () => {
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
      randomId: () => 'shared-nonce',
    });
    const store = new InMemoryHandoffNonceStore();
    const [first, second] = await Promise.all([
      transitionRoleSession(transitionArgs(source, packet, { nonceStore: store, randomId: () => 'dest-1' })),
      transitionRoleSession(transitionArgs(source, packet, { nonceStore: store, randomId: () => 'dest-2' })),
    ]);
    const outcomes = [first, second];
    expect(outcomes.filter((row) => row.ok).length).toBe(1);
    expect(outcomes.filter((row) => !row.ok && row.code === 'replayed').length).toBe(1);
  });

  test('packet is bound to the originating role session and cannot be replayed on another session', async () => {
    const source = createRoleInstance({
      authenticatedPlayerId: 'player-a',
      role: 'ALBERT_ASSISTANT',
      classification: { kind: 'none' },
      randomId: () => 'session-a',
    });
    const otherSource = createRoleInstance({
      authenticatedPlayerId: 'player-a',
      role: 'ALBERT_ASSISTANT',
      classification: { kind: 'none' },
      randomId: () => 'session-b',
    });
    const packet = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'TRAINER_PERSONA',
      reason: 'trainer_handoff',
    });
    const swapped = await transitionRoleSession(transitionArgs(otherSource, packet));
    expect(swapped).toEqual({ ok: false, code: 'source_mismatch' });
  });

  test('destination role and persona must be server-authorized, not packet-copied', async () => {
    const source = createRoleInstance({
      authenticatedPlayerId: 'player-a',
      role: 'ALBERT_ASSISTANT',
      classification: { kind: 'none' },
    });
    const packet = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'TRAINER_PERSONA',
      destinationPersonaId: 'trainer-default',
      reason: 'trainer_handoff',
    });
    const mismatchedAuth = await transitionRoleSession(
      transitionArgs(source, packet, {
        authorizedDestinationRole: 'ASI_ARENA',
        authorizedDestinationPersonaId: null,
      }),
    );
    expect(mismatchedAuth).toEqual({ ok: false, code: 'unauthorized_transition' });

    const wrongPersona = await transitionRoleSession(
      transitionArgs(source, packet, {
        authorizedDestinationRole: 'TRAINER_PERSONA',
        authorizedDestinationPersonaId: 'albert-default',
      }),
    );
    expect(wrongPersona).toEqual({ ok: false, code: 'unauthorized_transition' });

    expect(isAuthorizedRoleTransition('ASI_ARENA', 'BOT_LADDER_PERSONA')).toBe(false);
    expect(isAuthorizedRoleTransition('ALBERT_ASSISTANT', 'ALBERT_ASSISTANT')).toBe(false);
  });

  test('future, malformed, empty-nonce, and invalid age windows are rejected', async () => {
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
      now: new Date('2099-01-01T00:00:00.000Z'),
    });
    const future = await transitionRoleSession(
      transitionArgs(source, packet, { now: new Date('2026-01-01T00:00:00.000Z') }),
    );
    expect(future).toEqual({ ok: false, code: 'future' });

    const validNow = new Date('2026-01-01T00:00:00.000Z');
    const valid = createSanitizedHandoffPacket({
      authenticatedPlayerId: 'player-a',
      sourceSession: source,
      destinationRole: 'TRAINER_PERSONA',
      reason: 'trainer_handoff',
      now: validNow,
    });
    const emptyNonce = await transitionRoleSession(transitionArgs(source, { ...valid, nonce: '   ' }));
    expect(emptyNonce).toEqual({ ok: false, code: 'invalid_packet' });

    const malformed = await transitionRoleSession(transitionArgs(source, { ...valid, issuedAt: 'not-a-date' }));
    expect(malformed).toEqual({ ok: false, code: 'invalid_packet' });

    const invalidAge = await transitionRoleSession(transitionArgs(source, valid, { now: validNow, maxAgeMs: 0 }));
    expect(invalidAge).toEqual({ ok: false, code: 'invalid_packet' });

    const ok = await transitionRoleSession(transitionArgs(source, valid, { now: validNow, maxAgeMs: 60_000 }));
    expect(ok.ok).toBe(true);
  });
});
