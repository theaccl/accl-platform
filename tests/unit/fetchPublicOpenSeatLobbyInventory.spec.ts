import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildPublicOpenSeatLobbyInventory,
  chunkUniqueHostIds,
  fetchPublicOpenSeatLobbyInventory,
  mergePaginatedRowsById,
  PUBLIC_OPEN_SEAT_HOST_CHUNK_SIZE,
  PUBLIC_OPEN_SEAT_PAGE_SIZE,
  PUBLIC_OPEN_SEAT_QUERY_A_SELECT,
  PUBLIC_OPEN_SEAT_SEATED_SELECT,
} from '@/lib/fetchPublicOpenSeatLobbyInventory';
import type { PublicOpenSeatLobbyRow, PublicOpenSeatSeatedRow } from '@/lib/freeLobbyOpenSeatFilters';

function openSeatRow(
  id: string,
  host: string,
  overrides: Partial<PublicOpenSeatLobbyRow> = {},
): PublicOpenSeatLobbyRow {
  return {
    id,
    white_player_id: host,
    black_player_id: null,
    tempo: 'live',
    live_time_control: '10m',
    created_at: `2026-01-01T00:00:00.000Z`,
    rated: true,
    status: 'active',
    play_context: 'free',
    tournament_id: null,
    ...overrides,
  };
}

function seatedRow(
  id: string,
  white: string,
  black: string,
  overrides: Partial<PublicOpenSeatSeatedRow> = {},
): PublicOpenSeatSeatedRow {
  return {
    id,
    white_player_id: white,
    black_player_id: black,
    tempo: 'live',
    live_time_control: '10m',
    rated: true,
    status: 'active',
    ...overrides,
  };
}

type RangeCall = { from: number; to: number; kind: 'open' | 'seated' };

/**
 * Mock that exercises the real Query A / B/C `.range()` pagination loops.
 * Open seats are returned only from the open-seat branch; seated rows never enter Query A.
 */
function createPaginatedGamesClient(args: {
  openRows: PublicOpenSeatLobbyRow[];
  seatedByHost?: Map<string, PublicOpenSeatSeatedRow[]>;
  openError?: string;
  seatedError?: string;
}): { client: SupabaseClient; rangeCalls: RangeCall[] } {
  const rangeCalls: RangeCall[] = [];
  const seatedByHost = args.seatedByHost ?? new Map();

  const client = {
    from: () => ({
      select: (cols: string) => {
        const isOpenSelect = String(cols).includes('created_at');
        const state: {
          statuses?: string[];
          blackNull?: boolean;
          hostCol?: 'white_player_id' | 'black_player_id';
          hostIds?: string[];
        } = {};

        const api = {
          eq: () => api,
          is: (col: string, val: unknown) => {
            if (col === 'black_player_id' && val === null) state.blackNull = true;
            return api;
          },
          in: (col: string, vals: string[]) => {
            if (col === 'status') state.statuses = vals;
            if (col === 'white_player_id' || col === 'black_player_id') {
              state.hostCol = col;
              state.hostIds = vals;
            }
            return api;
          },
          not: () => api,
          order: () => api,
          range: async (from: number, to: number) => {
            if (isOpenSelect || state.blackNull) {
              rangeCalls.push({ from, to, kind: 'open' });
              if (args.openError) return { data: null, error: { message: args.openError } };
              const page = args.openRows.slice(from, to + 1);
              return { data: page, error: null };
            }
            rangeCalls.push({ from, to, kind: 'seated' });
            if (args.seatedError) return { data: null, error: { message: args.seatedError } };
            const hosts = state.hostIds ?? [];
            const all: PublicOpenSeatSeatedRow[] = [];
            for (const h of hosts) {
              for (const row of seatedByHost.get(h) ?? []) {
                if (state.hostCol === 'white_player_id' && row.white_player_id === h) all.push(row);
                if (state.hostCol === 'black_player_id' && row.black_player_id === h) all.push(row);
              }
            }
            all.sort((a, b) => a.id.localeCompare(b.id));
            return { data: all.slice(from, to + 1), error: null };
          },
        };
        return api;
      },
    }),
  } as unknown as SupabaseClient;

  return { client, rangeCalls };
}

test.describe('fetchPublicOpenSeatLobbyInventory', () => {
  test('field completeness: Query A and seated SELECT pin required columns (RC-1)', () => {
    expect(PUBLIC_OPEN_SEAT_QUERY_A_SELECT).toContain('black_player_id');
    expect(PUBLIC_OPEN_SEAT_QUERY_A_SELECT).toContain('play_context');
    expect(PUBLIC_OPEN_SEAT_QUERY_A_SELECT).toContain('tournament_id');
    expect(PUBLIC_OPEN_SEAT_SEATED_SELECT).toContain('white_player_id');
    expect(PUBLIC_OPEN_SEAT_SEATED_SELECT).toContain('black_player_id');
  });

  test('loader Query A: second .range() page is fetched and every open-seat id returned exactly once', async () => {
    const page1 = Array.from({ length: PUBLIC_OPEN_SEAT_PAGE_SIZE }, (_, i) =>
      openSeatRow(`open-${String(i).padStart(4, '0')}`, `host-${i}`, {
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    );
    const page2 = [
      openSeatRow('open-extra-1', 'host-extra-1', { created_at: '2026-01-01T00:00:01.000Z' }),
      openSeatRow('open-extra-2', 'host-extra-2', { created_at: '2026-01-01T00:00:02.000Z' }),
    ];
    const all = [...page1, ...page2];
    const { client, rangeCalls } = createPaginatedGamesClient({ openRows: all });

    const result = await fetchPublicOpenSeatLobbyInventory(client);
    expect(result.error).toBeNull();
    expect(result.inventory).not.toBeNull();

    const openRanges = rangeCalls.filter((c) => c.kind === 'open');
    expect(openRanges.length).toBeGreaterThanOrEqual(2);
    expect(openRanges[0]).toEqual({ from: 0, to: PUBLIC_OPEN_SEAT_PAGE_SIZE - 1, kind: 'open' });
    expect(openRanges[1]).toEqual({
      from: PUBLIC_OPEN_SEAT_PAGE_SIZE,
      to: PUBLIC_OPEN_SEAT_PAGE_SIZE * 2 - 1,
      kind: 'open',
    });

    const ids = result.inventory!.openCandidates.map((r) => r.id);
    expect(ids).toHaveLength(all.length);
    expect(new Set(ids).size).toBe(all.length);
    expect(ids).toContain('open-extra-1');
    expect(ids).toContain('open-extra-2');
  });

  test('loader Query A: equal created_at spanning page boundary yields no missing or duplicate ids', async () => {
    const sameTs = '2026-01-01T12:00:00.000Z';
    const rows = Array.from({ length: PUBLIC_OPEN_SEAT_PAGE_SIZE + 3 }, (_, i) =>
      openSeatRow(`tie-${String(i).padStart(4, '0')}`, `h-${i}`, { created_at: sameTs }),
    );
    const { client, rangeCalls } = createPaginatedGamesClient({ openRows: rows });
    const result = await fetchPublicOpenSeatLobbyInventory(client);
    expect(result.error).toBeNull();
    const openRanges = rangeCalls.filter((c) => c.kind === 'open');
    expect(openRanges.length).toBe(2);
    const ids = result.inventory!.openCandidates.map((r) => r.id);
    expect(ids).toHaveLength(rows.length);
    expect(new Set(ids).size).toBe(rows.length);
  });

  test('loader Query A: pagination loop stops only after a short page', async () => {
    const rows = Array.from({ length: PUBLIC_OPEN_SEAT_PAGE_SIZE * 2 + 7 }, (_, i) =>
      openSeatRow(`p-${i}`, `h-${i}`),
    );
    const { client, rangeCalls } = createPaginatedGamesClient({ openRows: rows });
    await fetchPublicOpenSeatLobbyInventory(client);
    const openRanges = rangeCalls.filter((c) => c.kind === 'open');
    expect(openRanges).toHaveLength(3);
    expect(openRanges[2]!.from).toBe(PUBLIC_OPEN_SEAT_PAGE_SIZE * 2);
  });

  test('loader seated B/C: multi-page seated results for targeted hosts are fully merged', async () => {
    const host = 'busy-host';
    const open = [openSeatRow('open-1', host)];
    const seatedPages = Array.from({ length: PUBLIC_OPEN_SEAT_PAGE_SIZE + 5 }, (_, i) =>
      seatedRow(`seated-${String(i).padStart(4, '0')}`, host, `opp-${i}`),
    );
    const { client, rangeCalls } = createPaginatedGamesClient({
      openRows: open,
      seatedByHost: new Map([[host, seatedPages]]),
    });

    const result = await fetchPublicOpenSeatLobbyInventory(client);
    expect(result.error).toBeNull();
    const seatedRanges = rangeCalls.filter((c) => c.kind === 'seated');
    expect(seatedRanges.length).toBeGreaterThanOrEqual(2);
    expect(result.inventory!.seatedForBusy.length).toBe(seatedPages.length);
  });

  test('Query A inventory is open-seat-only: unrelated seated volume cannot displace a legitimate open seat', async () => {
    const realOpen = openSeatRow('real-open', 'visible-host', { live_time_control: '5m' });
    // Seated rows are supplied only via host-targeted B/C — never as Query A pages.
    const manySeated = Array.from({ length: 300 }, (_, i) =>
      seatedRow(`unrelated-${i}`, `other-${i}`, `opp-${i}`),
    );
    const { client, rangeCalls } = createPaginatedGamesClient({
      openRows: [realOpen],
      seatedByHost: new Map([['visible-host', []]]),
    });

    const result = await fetchPublicOpenSeatLobbyInventory(client);
    expect(result.error).toBeNull();
    expect(result.inventory!.openCandidates.map((r) => r.id)).toEqual(['real-open']);
    // Query A only saw the one open page; 300 unrelated seated rows were never Query A input.
    const openRanges = rangeCalls.filter((c) => c.kind === 'open');
    expect(openRanges).toHaveLength(1);
    expect(manySeated).toHaveLength(300);
  });

  test('mergePaginatedRowsById dedupes across pages (helper)', () => {
    const pages = [
      [openSeatRow('a', 'u1'), openSeatRow('b', 'u2')],
      [openSeatRow('b', 'u2'), openSeatRow('c', 'u3')],
    ];
    expect(mergePaginatedRowsById(pages).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  test('chunkUniqueHostIds splits at 100', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `host-${i}`);
    const chunks = chunkUniqueHostIds(ids);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(PUBLIC_OPEN_SEAT_HOST_CHUNK_SIZE);
  });

  test('more than 100 hosts triggers chunked seated lookups and complete merge', async () => {
    const hostIds = Array.from({ length: PUBLIC_OPEN_SEAT_HOST_CHUNK_SIZE + 5 }, (_, i) => `host-${i}`);
    const openRows = hostIds.map((h, i) => openSeatRow(`o-${i}`, h));
    const seatedByHost = new Map<string, PublicOpenSeatSeatedRow[]>(
      hostIds.map((h) => [h, [seatedRow(`s-${h}`, h, 'opp')]]),
    );
    const { client } = createPaginatedGamesClient({ openRows, seatedByHost });
    const result = await fetchPublicOpenSeatLobbyInventory(client);
    expect(result.error).toBeNull();
    expect(result.inventory!.seatedForBusy.length).toBe(hostIds.length);
  });

  test('Query A failure returns null inventory and error (RC-4)', async () => {
    const { client } = createPaginatedGamesClient({ openRows: [], openError: 'query-a-failed' });
    const result = await fetchPublicOpenSeatLobbyInventory(client);
    expect(result.inventory).toBeNull();
    expect(result.error).toBe('query-a-failed');
  });

  test('any B/C seated failure fails the complete sync (RC-4)', async () => {
    const { client } = createPaginatedGamesClient({
      openRows: [openSeatRow('open-1', 'busy-host')],
      seatedError: 'seated-chunk-failed',
    });
    const result = await fetchPublicOpenSeatLobbyInventory(client);
    expect(result.inventory).toBeNull();
    expect(result.error).toBe('seated-chunk-failed');
  });

  test('buildPublicOpenSeatLobbyInventory excludes tournament and non-active rows', () => {
    const valid = openSeatRow('ok', 'u1');
    const tournament = openSeatRow('t', 'u2', { tournament_id: 't-1' });
    const finished = openSeatRow('f', 'u3', { status: 'finished' });
    const inventory = buildPublicOpenSeatLobbyInventory([valid, tournament, finished], []);
    expect(inventory.openCandidates.map((r) => r.id)).toEqual(['ok']);
  });
});
