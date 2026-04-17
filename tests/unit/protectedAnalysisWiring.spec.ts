import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import {
  getIntegrityControlledTruth,
  InMemoryAntiCheatEnforcementStore,
  InMemoryModeratorQueueSink,
} from '../../lib/analysis';
import { runProtectedAnalysisRequest } from '../../lib/analysis/protectedAnalysisServer';

const START_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B5/5N2/PPPPPPPP/RNBQK2R b KQkq - 2 2';

function createFakeServiceClient() {
  const antiCheatEvents: Record<string, unknown>[] = [];
  const enforcementRows = new Map<string, Record<string, unknown>>();
  const gameRow = {
    id: '00000000-0000-0000-0000-00000000ab01',
    status: 'active',
    rated: true,
    tournament_id: null,
    fen: START_FEN,
    white_player_id: '00000000-0000-0000-0000-00000000aa01',
    black_player_id: '00000000-0000-0000-0000-00000000aa02',
  };
  const from = (table: string) => {
    const state: Record<string, unknown> = { eq: {}, gte: {} };
    const api = {
      insert: async (row: Record<string, unknown>) => {
        if (table === 'anti_cheat_events') antiCheatEvents.push(row);
        return { error: null };
      },
      upsert: async (row: Record<string, unknown>) => {
        if (table === 'anti_cheat_enforcement_states') {
          enforcementRows.set(String(row.user_id ?? ''), {
            ...(enforcementRows.get(String(row.user_id ?? '')) ?? {}),
            ...row,
          });
        }
        return { error: null };
      },
      select: (_columns: string) => api,
      eq: (k: string, v: unknown) => {
        (state.eq as Record<string, unknown>)[k] = v;
        return api;
      },
      gte: (k: string, v: unknown) => {
        (state.gte as Record<string, unknown>)[k] = v;
        return api;
      },
      order: (_k: string, _opts?: unknown) => api,
      limit: async (n: number) => {
        if (table !== 'anti_cheat_events') return { data: [], error: null };
        const uid = String((state.eq as Record<string, unknown>).user_id ?? '');
        const rows = antiCheatEvents.filter((r) => String(r.user_id ?? '') === uid).slice(0, n);
        return { data: rows, error: null };
      },
      single: async () => {
        if (table === 'games') {
          return { data: gameRow, error: null };
        }
        return { data: null, error: null };
      },
      maybeSingle: async () => {
        if (table === 'games') {
          return { data: gameRow, error: null };
        }
        if (table === 'anti_cheat_enforcement_states') {
          const uid = String((state.eq as Record<string, unknown>).user_id ?? '');
          return { data: enforcementRows.get(uid) ?? null, error: null };
        }
        return { data: null, error: null };
      },
      then: undefined,
    };
    return api;
  };
  return {
    client: { from } as unknown as Parameters<typeof runProtectedAnalysisRequest>[0]['serviceClient'],
    antiCheatEvents,
    enforcementRows,
    gameRow,
  };
}

test.describe('Protected analysis wiring', () => {
  test('protected server path passes real user/game identifiers into anti-cheat persistence', async () => {
    const fake = createFakeServiceClient();
    await runProtectedAnalysisRequest({
      serviceClient: fake.client,
      userId: fake.gameRow.white_player_id,
      gameId: fake.gameRow.id,
      fen: START_FEN,
      mode: 'coach',
    });
    expect(fake.antiCheatEvents.length).toBeGreaterThan(0);
    const row = fake.antiCheatEvents[0] as { user_id: string; game_id: string | null; request_context: Record<string, unknown> };
    expect(row.user_id).toBe(fake.gameRow.white_player_id);
    expect(row.game_id).toBe(fake.gameRow.id);
    expect(row.request_context.context_type).toBe('active-rated-game');
  });

  test('blocked protected requests still persist with engine_called=false', async () => {
    const fake = createFakeServiceClient();
    await runProtectedAnalysisRequest({
      serviceClient: fake.client,
      userId: fake.gameRow.white_player_id,
      gameId: fake.gameRow.id,
      fen: START_FEN,
      mode: 'coach',
    });
    const row = fake.antiCheatEvents[0] as { engine_called: boolean; request_context: Record<string, unknown> };
    expect(row.engine_called).toBe(false);
    expect(row.request_context.engineCalled).toBe(false);
  });

  test('high-risk recommendation generates moderator queue payload', async () => {
    const sink = new InMemoryModeratorQueueSink();
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: {
        type: 'active-unrated-free-play-game',
        liveHumanVsHuman: false,
        explicitConsentMode: true,
      },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
        requestMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
      },
      userId: '00000000-0000-0000-0000-000000000123',
      gameId: '00000000-0000-0000-0000-000000000456',
      moderatorQueueSink: sink,
      truthProvider: async () => ({
        rows: [],
        engine: { best_move: 'Nf6', candidate_moves: ['Nf6'], confidence: 0.61, depth: 16 },
        mode: 'coach',
        tablebaseHook: null,
        openingDbHook: null,
      }),
    });
    expect(res.audit.moderatorQueuePayload).not.toBeNull();
    const snapshot = sink.snapshot();
    expect(snapshot.length).toBe(1);
    expect(snapshot[0]?.user_id).toBe('00000000-0000-0000-0000-000000000123');
  });

  test('restrictive enforcement state blocks before engine and returns metadata', async () => {
    const res = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        activeGameFen: START_FEN,
        activeGameMoves: ['e4', 'e5', 'Nf3', 'Nc6'],
        requestMoves: ['e4', 'e5', 'Nf3', 'Nc6'],
        signalCounts: {
          blockedRequest: 6,
          protectedOverlapAttempt: 3,
          confirmedOverlap: 3,
        },
      },
      userId: '00000000-0000-0000-0000-00000000ff01',
      enforcementStore: new InMemoryAntiCheatEnforcementStore(),
      truthProvider: async () => {
        throw new Error('engine should not be called');
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal.code).toBe('ENFORCEMENT_RESTRICTED');
      expect(res.audit.enforcement.state).not.toBe('NO_RESTRICTION');
      expect(res.audit.engineCalled).toBe(false);
    }
  });

  test('moderator override can clear enforcement state', async () => {
    const store = new InMemoryAntiCheatEnforcementStore();
    const userId = '00000000-0000-0000-0000-00000000ff02';
    await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: {
        signalCounts: { blockedRequest: 8, protectedOverlapAttempt: 4, confirmedOverlap: 4 },
      },
      userId,
      enforcementStore: store,
      truthProvider: async () => {
        throw new Error('engine should not be called');
      },
    });
    await store.applyModeratorOverride({
      userId,
      moderatorId: '00000000-0000-0000-0000-00000000ab00',
      action: 'CLEAR_RESTRICTION',
      reason: 'manual review cleared',
    });
    const unlocked = await getIntegrityControlledTruth({
      fen: START_FEN,
      mode: 'coach',
      context: { type: 'training-mode' },
      overlap: { signalCounts: {} },
      userId,
      enforcementStore: store,
      truthProvider: async () => ({
        rows: [],
        engine: { best_move: 'Nf6', candidate_moves: ['Nf6'], confidence: 0.61, depth: 16 },
        mode: 'coach',
        tablebaseHook: null,
        openingDbHook: null,
      }),
    });
    expect(unlocked.ok).toBe(true);
    if (unlocked.ok) {
      expect(unlocked.audit.enforcement.source).toBe('override');
      expect(unlocked.audit.enforcement.state).toBe('NO_RESTRICTION');
    }
  });

  test('client game page has no direct anti_cheat_events write path', async () => {
    const gamePage = readFileSync('app/game/[id]/page.tsx', 'utf8');
    expect(gamePage.includes('anti_cheat_events')).toBe(false);
    expect(gamePage.includes('/api/protected/analysis')).toBe(true);
  });
});
