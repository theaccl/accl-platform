import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';

import {
  getIntegrityControlledTruth,
  InMemoryAntiCheatEventStore,
  InMemoryAntiCheatEnforcementStore,
  InMemoryModeratorQueueSink,
} from '../../lib/analysis';
import {
  deriveProtectedAnalysisOverlap,
  runProtectedAnalysisRequest,
} from '../../lib/analysis/protectedAnalysisServer';
import { parseProtectedAnalysisBody } from '../../lib/analysis/protectedAnalysisHttp';

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
      select: () => api,
      eq: (k: string, v: unknown) => {
        (state.eq as Record<string, unknown>)[k] = v;
        return api;
      },
      gte: (k: string, v: unknown) => {
        (state.gte as Record<string, unknown>)[k] = v;
        return api;
      },
      order: () => api,
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
  test('HTTP contract rejects forged overlap evidence and unknown fields', async () => {
    const valid = {
      gameId: '00000000-0000-0000-0000-00000000ab01',
      fen: START_FEN,
      mode: 'analyst',
    };
    expect(parseProtectedAnalysisBody(valid)).toEqual({ ok: true, value: valid });

    for (const forged of [
      { overlap: { signalCounts: { blockedRequest: -9 } } },
      { signalCounts: { blockedRequest: Number.POSITIVE_INFINITY } },
      { repeatedProbeCount: 10_001 },
      { activeGameFen: START_FEN },
      { activeGameMoves: ['e4'] },
      { requestMoves: ['e4'] },
      { requestMarker: 'forged' },
      { lastSignalAtEpochMs: Date.now() },
    ]) {
      expect(parseProtectedAnalysisBody({ ...valid, ...forged })).toMatchObject({
        ok: false,
        status: 400,
      });
    }
  });

  test('overlap evidence is derived from authenticated canonical active-game records only', async () => {
    const userId = '00000000-0000-0000-0000-00000000aa01';
    const humanGameId = '00000000-0000-0000-0000-00000000cc01';
    const botGameId = '00000000-0000-0000-0000-00000000cc02';
    const board = new Chess();
    const humanMoves = ['e4', 'e5'].map((san, index) => {
      const fen_before = board.fen();
      board.move(san);
      return { id: String(index), game_id: humanGameId, san, fen_before, fen_after: board.fen(), created_at: new Date(index * 1000).toISOString() };
    });
    const canonicalFen = board.fen();
    const activeRows = [
      {
        id: humanGameId,
        status: 'active',
        rated: true,
        tournament_id: null,
        fen: canonicalFen,
        white_player_id: userId,
        black_player_id: '00000000-0000-0000-0000-00000000aa02',
        source_type: 'human_game',
      },
      {
        id: botGameId,
        status: 'active',
        rated: false,
        tournament_id: null,
        fen: START_FEN,
        white_player_id: userId,
        black_player_id: '00000000-0000-0000-0000-00000000aa03',
        source_type: 'bot_game',
      },
    ];
    const observed: { activeOr?: string; moveIds?: string[] } = {};
    const client = {
      from: (table: string) => {
        const api = {
          select: () => api,
          eq: () => api,
          or: (expression: string) => {
            observed.activeOr = expression;
            return api;
          },
          limit: () => api,
          in: (_column: string, ids: string[]) => {
            observed.moveIds = ids;
            return api;
          },
          order: () => api,
          then: (resolve: (value: unknown) => unknown) => {
            const data = table === 'games' ? activeRows : humanMoves;
            return Promise.resolve(resolve({ data, count: data.length, error: null }));
          },
        };
        if (table !== 'games' && table !== 'game_move_logs') {
          throw new Error(`unexpected table ${table}`);
        }
        return api;
      },
    } as unknown as Parameters<typeof deriveProtectedAnalysisOverlap>[0]['serviceClient'];

    const overlap = await deriveProtectedAnalysisOverlap({
      serviceClient: client,
      userId,
      requestFen: canonicalFen,
      requestMoves: ['e4', 'e5'],
    });

    expect(observed.activeOr).toContain(userId);
    expect(observed.moveIds).toEqual([humanGameId]);
    expect(overlap.activeGameFen).toBe(canonicalFen);
    expect(overlap.activeGameMoves).toEqual(['e4', 'e5']);
    expect(overlap.requestMoves).toEqual(['e4', 'e5']);
  });

  test('finished review binds the request to canonical intake and passes canonical moves only', async () => {
    const userId = '00000000-0000-0000-0000-00000000aa01';
    const gameId = '00000000-0000-0000-0000-00000000ab01';
    const finalFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
    const gameRow = {
      id: gameId,
      status: 'finished',
      rated: false,
      tournament_id: null,
      fen: finalFen,
      white_player_id: userId,
      black_player_id: '00000000-0000-0000-0000-00000000aa02',
    };
    const client = {
      from: () => {
        const api = {
          select: () => api,
          eq: () => api,
          maybeSingle: async () => ({ data: gameRow, error: null }),
        };
        return api;
      },
      rpc: async () => ({
        data: {
          schema_version: 'fgi.1',
          game: {
            ...gameRow,
            analysis_partition: 'free',
            play_context: 'free',
            tempo: null,
            live_time_control: null,
            source_type: 'human_game',
            mode: null,
            winner_id: null,
            result: '1/2-1/2',
            end_reason: 'draw',
            finished_at: '2026-09-06T00:00:00.000Z',
            created_at: '2026-09-06T00:00:00.000Z',
            final_fen: finalFen,
            final_turn: 'w',
          },
          players: { white: null, black: null },
          move_logs: [
            {
              san: 'e4',
              fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
              fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
              created_at: '2026-09-06T00:00:01.000Z',
              from_sq: 'e2',
              to_sq: 'e4',
            },
            {
              san: 'e5',
              fen_before: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
              fen_after: finalFen,
              created_at: '2026-09-06T00:00:02.000Z',
              from_sq: 'e7',
              to_sq: 'e5',
            },
          ],
        },
        error: null,
      }),
    } as unknown as Parameters<typeof runProtectedAnalysisRequest>[0]['serviceClient'];
    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const intermediateFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const providerFens: string[] = [];

    for (const fen of [initialFen, intermediateFen, finalFen]) {
      const result = await runProtectedAnalysisRequest({
        serviceClient: client,
        userId,
        gameId,
        fen,
        mode: 'analyst',
        antiCheatStore: new InMemoryAntiCheatEventStore(),
        enforcementStore: new InMemoryAntiCheatEnforcementStore(),
        moderatorQueueSink: new InMemoryModeratorQueueSink(),
        protectedAnalysisOverlapProvider: async ({ requestMoves }) => ({ requestMoves }),
        protectedReviewTruthProvider: async (input) => {
          providerFens.push(input.fen);
          return {
            rows: input.moves.map((move, index) => ({
              index,
              san: move.san,
              classification: 'good' as const,
              analyzerType: 'engine' as const,
            })),
            engine: { best_move: 'Nf3', candidate_moves: ['Nf3'], confidence: 0.5, depth: 12 },
            mode: input.mode,
            tablebaseHook: null,
            openingDbHook: null,
          };
        },
      });
      expect(result.ok).toBe(true);
    }

    expect(providerFens).toEqual([
      initialFen,
      intermediateFen,
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    ]);
  });

  test('finished review rejects a position absent from canonical intake before runtime', async () => {
    const userId = '00000000-0000-0000-0000-00000000aa01';
    const gameId = '00000000-0000-0000-0000-00000000ab01';
    const board = new Chess();
    const canonicalLogs = ['e4', 'e5'].map((san) => {
      const fen_before = board.fen();
      board.move(san);
      return { san, fen_before, fen_after: board.fen() };
    });
    const finalFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
    const gameRow = {
      id: gameId,
      status: 'finished',
      rated: false,
      tournament_id: null,
      fen: finalFen,
      white_player_id: userId,
      black_player_id: '00000000-0000-0000-0000-00000000aa02',
    };
    const client = {
      from: () => {
        const api = {
          select: () => api,
          eq: () => api,
          maybeSingle: async () => ({ data: gameRow, error: null }),
        };
        return api;
      },
      rpc: async () => ({
        data: {
          schema_version: 'fgi.1',
          game: {
            ...gameRow,
            analysis_partition: 'free',
            play_context: 'free',
            tempo: null,
            live_time_control: null,
            source_type: 'human_game',
            mode: null,
            winner_id: null,
            result: '1/2-1/2',
            end_reason: 'draw',
            finished_at: '2026-09-06T00:00:00.000Z',
            created_at: '2026-09-06T00:00:00.000Z',
            final_fen: finalFen,
            final_turn: 'w',
          },
          players: { white: null, black: null },
          move_logs: canonicalLogs,
        },
        error: null,
      }),
    } as unknown as Parameters<typeof runProtectedAnalysisRequest>[0]['serviceClient'];
    let called = false;

    await expect(
      runProtectedAnalysisRequest({
        serviceClient: client,
        userId,
        gameId,
        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
        mode: 'analyst',
        protectedReviewTruthProvider: async () => {
          called = true;
          throw new Error('must not run');
        },
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(called).toBe(false);
  });

  test('non-participants cannot request analysis for another player game', async () => {
    const fake = createFakeServiceClient();
    await expect(
      runProtectedAnalysisRequest({
        serviceClient: fake.client,
        userId: '00000000-0000-0000-0000-00000000ffff',
        gameId: fake.gameRow.id,
        fen: START_FEN,
        mode: 'coach',
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(fake.antiCheatEvents).toHaveLength(0);
  });

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
    const protectedRequest = gamePage.slice(
      gamePage.indexOf("fetch('/api/protected/analysis'"),
      gamePage.indexOf("fetch('/api/protected/analysis'") + 1_200
    );
    expect(gamePage.includes('anti_cheat_events')).toBe(false);
    expect(gamePage.includes('/api/protected/analysis')).toBe(true);
    expect(protectedRequest).not.toContain('overlap:');
    expect(protectedRequest).not.toContain('activeGameFen');
    expect(protectedRequest).not.toContain('requestMoves');
    expect(gamePage.includes('const controller = new AbortController()')).toBe(true);
    expect(gamePage.includes('signal: controller.signal')).toBe(true);
    expect(gamePage.includes('controller.abort()')).toBe(true);
  });

  test('participant-only finished artifact migration is explicit and fail closed', async () => {
    const migration = readFileSync(
      'supabase/migrations/20260908120000_finished_game_analysis_artifact_participant_read.sql',
      'utf8'
    );
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('g.white_player_id = v_uid');
    expect(migration).toContain('g.black_player_id = v_uid');
    expect(migration).toContain("auth.jwt() ->> 'role'");
    expect(migration).toContain("= 'service_role'");
    expect(migration).toContain("return '[]'::jsonb");
    expect(migration).toContain('revoke all on function public.get_latest_finished_game_analysis_artifacts(uuid) from public');
    expect(migration).toContain('grant execute on function public.get_latest_finished_game_analysis_artifacts(uuid) to authenticated, service_role');
  });

  test('enforcement migration preserves the stronger baseline atomically', async () => {
    const migration = readFileSync(
      'supabase/migrations/20260908121000_anti_cheat_enforcement_monotonic_baseline.sql',
      'utf8'
    );
    expect(migration).toContain('before update on public.anti_cheat_enforcement_states');
    expect(migration).toContain('if v_new_rank < v_old_rank then');
    expect(migration).toContain('new.enforcement_state := old.enforcement_state');
    expect(migration).toContain('new.source_suspicion_tier := old.source_suspicion_tier');
    expect(migration).toContain('new.source_recommended_action := old.source_recommended_action');
    expect(migration).toContain('new.source_reason_json := old.source_reason_json');
  });
});
