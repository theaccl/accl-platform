import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleAlbertMessage, type AlbertMessageRouteDeps } from '../../app/api/albert/message/handler';
import type { AuthoritativeGameSnapshot, LoadSeatedGamesResult } from '../../lib/coreIntelligence';

const PLAYER_A = '11111111-1111-1111-1111-111111111111';

let userSeq = 0;

function adultUser(id = `${PLAYER_A.slice(0, -4)}${(++userSeq).toString().padStart(4, '0')}`) {
  return {
    id,
    email: 'a@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { ecosystem: 'adult' },
    user_metadata: {},
    identities: [{ provider: 'email' }],
  };
}

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
    white_player_id: PLAYER_A,
    black_player_id: '22222222-2222-2222-2222-222222222222',
    ...overrides,
  };
}

function requestWith(body: Record<string, unknown>) {
  return new Request('http://localhost/api/albert/message', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeps(
  loadResult: LoadSeatedGamesResult | 'throw',
  complete?: AlbertMessageRouteDeps['completeModelAttempt'],
) {
  const state = { llmCalls: 0 };
  const injected: AlbertMessageRouteDeps = {
    resolveAuthenticatedUser: async () => adultUser(),
    createServiceRoleClient: () => ({}) as never,
    loadSeatedGames: async () => {
      if (loadResult === 'throw') throw new Error('db_down');
      return loadResult;
    },
    completeModelAttempt: async (input) => {
      state.llmCalls += 1;
      if (!complete) throw new Error('LLM_MUST_NOT_RUN');
      return complete(input);
    },
  };
  return { injected, llmCalls: () => state.llmCalls };
}

async function readJson(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test.describe('Albert message route gate', () => {
  test('route wiring uses the server-owned gate before LLM work', () => {
    const route = readFileSync(join(process.cwd(), 'app', 'api', 'albert', 'message', 'route.ts'), 'utf8');
    const handler = readFileSync(join(process.cwd(), 'app', 'api', 'albert', 'message', 'handler.ts'), 'utf8');
    expect(route).toContain("from './handler'");
    expect(handler).toContain('evaluateAlbertRouteAccess');
    expect(handler).toContain('loadSeatedGames');
  });

  test('active live human game denies Albert and does not call the LLM or fallback', async () => {
    const { injected, llmCalls } = makeDeps({ ok: true, rows: [snapshot()] });
    const result = await readJson(await handleAlbertMessage(requestWith({ message: 'Hello Albert' }), injected));
    expect(result.status).toBe(403);
    expect(result.body.ok).toBe(false);
    expect(result.body.code).toBe('albert_blocked_active_game');
    expect(result.body.mode).toBeUndefined();
    expect(llmCalls()).toBe(0);
  });

  test('active correspondence, tournament, and bot_game all deny Albert', async () => {
    const cases: AuthoritativeGameSnapshot[] = [
      snapshot({ tempo: 'correspondence', source_type: 'challenge' }),
      snapshot({ play_context: 'tournament', tournament_id: 't1', source_type: 'tournament_bracket' }),
      snapshot({ source_type: 'bot_game', bot_settings: { version: 'accl_bot_v1' } }),
    ];
    for (const row of cases) {
      const { injected, llmCalls } = makeDeps({ ok: true, rows: [row] });
      const result = await readJson(await handleAlbertMessage(requestWith({ message: 'help' }), injected));
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('albert_blocked_active_game');
      expect(llmCalls()).toBe(0);
    }
  });

  test('caller completed/gameType spoof does not unlock Albert during an active game', async () => {
    const { injected, llmCalls } = makeDeps({ ok: true, rows: [snapshot()] });
    const result = await readJson(
      await handleAlbertMessage(
        requestWith({
          message: 'review this',
          gameType: 'completed',
          completed: true,
          classification: 'training',
          capabilities: { canBePresentAsAlbertDuringAnyActiveGame: true },
        }),
        injected,
      ),
    );
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('albert_blocked_active_game');
    expect(llmCalls()).toBe(0);
  });

  test('lookup failure and unresolved classification fail closed without LLM', async () => {
    const failed = makeDeps({ ok: false, reason: 'lookup_failed' });
    const failedResult = await readJson(await handleAlbertMessage(requestWith({ message: 'hi' }), failed.injected));
    expect(failedResult.status).toBe(403);
    expect(failedResult.body.code).toBe('albert_lookup_failed');
    expect(failed.llmCalls()).toBe(0);

    const thrown = makeDeps('throw');
    const thrownResult = await readJson(await handleAlbertMessage(requestWith({ message: 'hi' }), thrown.injected));
    expect(thrownResult.status).toBe(403);
    expect(thrownResult.body.code).toBe('albert_lookup_failed');
    expect(thrown.llmCalls()).toBe(0);

    const unresolved = makeDeps({
      ok: true,
      rows: [snapshot({ play_context: 'tournament', tournament_id: null })],
    });
    const unresolvedResult = await readJson(
      await handleAlbertMessage(requestWith({ message: 'hi' }), unresolved.injected),
    );
    expect(unresolvedResult.status).toBe(403);
    expect(unresolvedResult.body.code).toBe('albert_presence_unresolved');
    expect(unresolved.llmCalls()).toBe(0);
  });

  test('no seated active game allows the existing outside-game Albert path', async () => {
    const { injected, llmCalls } = makeDeps({ ok: true, rows: [] }, async () => ({
      text: 'Hello from Albert.',
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    const result = await readJson(await handleAlbertMessage(requestWith({ message: 'Hello Albert' }), injected));
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, mode: 'generated', reply: 'Hello from Albert.' });
    expect(llmCalls()).toBeGreaterThan(0);
  });
});
