import { expect, test } from '@playwright/test';

import {
  loadSeatedAuthoritativeGamesForPlayer,
  SEATED_AUTHORIZATION_GAME_SELECT,
} from '../../lib/coreIntelligence';

type QueryCall = {
  table: string;
  select?: string;
  statusIn?: unknown;
  orFilter?: string;
  order?: { column: string; ascending: boolean };
  limit?: number;
};

function createGamesClient(result: { data?: unknown; error?: { message: string } | null }, calls: QueryCall[]) {
  const api: Record<string, unknown> = {};
  const current: QueryCall = { table: 'games' };
  api.select = (columns: string) => {
    current.select = columns;
    return api;
  };
  api.in = (column: string, values: unknown) => {
    if (column === 'status') current.statusIn = values;
    return api;
  };
  api.or = (filter: string) => {
    current.orFilter = filter;
    return api;
  };
  api.order = (column: string, opts: { ascending: boolean }) => {
    current.order = { column, ascending: opts.ascending };
    return api;
  };
  api.limit = async (value: number) => {
    current.limit = value;
    calls.push({ ...current });
    return { data: result.data ?? null, error: result.error ?? null };
  };
  return {
    from: (table: string) => {
      current.table = table;
      return api;
    },
  };
}

test.describe('seated-game authorization loader', () => {
  test('queries public.games with required columns, active/waiting, and both seat filters', async () => {
    const calls: QueryCall[] = [];
    const uid = '11111111-1111-1111-1111-111111111111';
    const client = createGamesClient(
      {
        data: [
          {
            id: 'game-1',
            status: 'active',
            tempo: 'live',
            play_context: 'free',
            mode: 'SKETCH',
            source_type: 'challenge',
            rated: false,
            tournament_id: null,
            bot_settings: null,
            white_player_id: uid,
            black_player_id: '22222222-2222-2222-2222-222222222222',
            updated_at: '2026-01-01T00:00:00.000Z',
            gameType: 'completed',
          },
        ],
      },
      calls,
    );
    const loaded = await loadSeatedAuthoritativeGamesForPlayer(client as never, uid);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(calls).toEqual([
      {
        table: 'games',
        select: SEATED_AUTHORIZATION_GAME_SELECT,
        statusIn: ['active', 'waiting'],
        orFilter: `white_player_id.eq.${uid},black_player_id.eq.${uid}`,
        order: { column: 'updated_at', ascending: false },
        limit: 64,
      },
    ]);
    expect(loaded.rows).toHaveLength(1);
    expect(loaded.rows[0]).toMatchObject({
      id: 'game-1',
      status: 'active',
      source_type: 'challenge',
      white_player_id: uid,
    });
    expect(loaded.rows[0]).not.toHaveProperty('gameType');
  });

  test('fails closed on query error and never queries with an empty caller identity', async () => {
    const calls: QueryCall[] = [];
    const failed = await loadSeatedAuthoritativeGamesForPlayer(
      createGamesClient({ error: { message: 'db_down' } }, calls) as never,
      '11111111-1111-1111-1111-111111111111',
    );
    expect(failed).toEqual({ ok: false, reason: 'lookup_failed' });
    expect(calls).toHaveLength(1);

    const noQuery: QueryCall[] = [];
    const unauthenticated = await loadSeatedAuthoritativeGamesForPlayer(
      createGamesClient({ data: [] }, noQuery) as never,
      '   ',
    );
    expect(unauthenticated).toEqual({ ok: false, reason: 'unauthenticated' });
    expect(noQuery).toHaveLength(0);
  });

  test('filters both participant columns using authenticated user.id only', async () => {
    const calls: QueryCall[] = [];
    const authenticated = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const callerSpoof = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await loadSeatedAuthoritativeGamesForPlayer(
      createGamesClient({ data: [] }, calls) as never,
      authenticated,
    );
    expect(calls[0]?.orFilter).toBe(
      `white_player_id.eq.${authenticated},black_player_id.eq.${authenticated}`,
    );
    expect(calls[0]?.orFilter).not.toContain(callerSpoof);
  });
});
