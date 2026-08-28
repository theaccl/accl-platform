import { expect, test } from '@playwright/test';

import {
  assertPersonaDefinitionHasNoPlayerModel,
  authorizePlayerModelProjection,
} from '../../lib/coreIntelligence';

test.describe('core intelligence player model isolation', () => {
  test('Player A cannot resolve Player B projection through the contract', () => {
    const result = authorizePlayerModelProjection({
      authenticatedPlayerId: 'player-a',
      requestedPlayerId: 'player-b',
      role: 'ALBERT_ASSISTANT',
      personaId: 'albert-default',
      handoffPlayerId: 'player-b',
    });
    expect(result).toEqual({ ok: false, code: 'cross_player' });
  });

  test('authenticated identity is the only player key, including ASI none', () => {
    const own = authorizePlayerModelProjection({
      authenticatedPlayerId: 'player-a',
      requestedPlayerId: 'player-a',
      role: 'ALBERT_ASSISTANT',
      handoffPlayerId: 'player-b',
    });
    expect(own).toEqual({ ok: true, playerId: 'player-a', projection: 'coaching' });

    const asi = authorizePlayerModelProjection({
      authenticatedPlayerId: 'player-a',
      requestedPlayerId: 'player-a',
      role: 'ASI_ARENA',
    });
    expect(asi).toEqual({ ok: true, playerId: 'player-a', projection: 'none' });
  });

  test('persona definitions cannot embed player-model fields', () => {
    expect(() =>
      assertPersonaDefinitionHasNoPlayerModel({
        id: 'bad',
        role: 'ALBERT_ASSISTANT',
        displayName: 'Bad',
        styleNotes: null,
        playerModel: { secrets: true },
      } as never),
    ).toThrow(/persona_must_not_embed_player_model/);
  });
});
