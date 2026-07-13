import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isPublicUnmatchedOpenSeatRow,
  type PublicOpenSeatLobbyRow,
  type PublicOpenSeatSeatedRow,
} from '@/lib/freeLobbyOpenSeatFilters';

/** Page size for deterministic open-seat and seated-row pagination (RC-2). */
export const PUBLIC_OPEN_SEAT_PAGE_SIZE = 200;

/** Host-ID chunk size for seated-row B/C queries (RC-3). */
export const PUBLIC_OPEN_SEAT_HOST_CHUNK_SIZE = 100;

/**
 * Query A SELECT — superset of fields read by public open-seat predicates (RC-1).
 * Includes black_player_id (filtered IS NULL), play_context, tournament_id.
 * Bot exclusion uses white_player_id only (no extra games columns).
 */
export const PUBLIC_OPEN_SEAT_QUERY_A_SELECT =
  'id,white_player_id,black_player_id,tempo,live_time_control,created_at,rated,status,play_context,tournament_id' as const;

/** Seated-row SELECT — superset of PublicOpenSeatSeatedRow + openSeatRowHostSeatedConflictsInSameSlot. */
export const PUBLIC_OPEN_SEAT_SEATED_SELECT =
  'id,white_player_id,black_player_id,tempo,live_time_control,rated,status' as const;

export type PublicOpenSeatLobbyInventory = {
  openCandidates: PublicOpenSeatLobbyRow[];
  seatedForBusy: PublicOpenSeatSeatedRow[];
};

export type FetchPublicOpenSeatLobbyInventoryResult = {
  inventory: PublicOpenSeatLobbyInventory | null;
  error: string | null;
};

type OpenSeatQueryRow = PublicOpenSeatLobbyRow & {
  black_player_id: string | null;
  created_at: string;
};

/** Merge paginated pages; dedupe by id (RC-2 range-pagination safety). */
export function mergePaginatedRowsById<T extends { id: string }>(pages: T[][]): T[] {
  const merged = new Map<string, T>();
  for (const page of pages) {
    for (const row of page) {
      merged.set(row.id, row);
    }
  }
  return [...merged.values()];
}

/** Chunk unique host IDs for B/C queries (RC-3). */
export function chunkUniqueHostIds(hostIds: string[], chunkSize = PUBLIC_OPEN_SEAT_HOST_CHUNK_SIZE): string[][] {
  const unique = [...new Set(hostIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }
  return chunks;
}

/** Merge seated rows; dedupe by game id. */
export function mergeSeatedRowsById(rows: PublicOpenSeatSeatedRow[]): PublicOpenSeatSeatedRow[] {
  const merged = new Map<string, PublicOpenSeatSeatedRow>();
  for (const row of rows) {
    merged.set(row.id, row);
  }
  return [...merged.values()];
}

/** Pure assembly after Query A + seated rows are fully fetched. */
export function buildPublicOpenSeatLobbyInventory(
  unmatchedActiveRows: PublicOpenSeatLobbyRow[],
  hostSeatedRows: PublicOpenSeatSeatedRow[],
): PublicOpenSeatLobbyInventory {
  const openCandidates = unmatchedActiveRows.filter((r) => isPublicUnmatchedOpenSeatRow(r));
  return {
    openCandidates,
    seatedForBusy: mergeSeatedRowsById(hostSeatedRows),
  };
}

/**
 * Deterministic ordered pagination via `.range()` (RC-2).
 * Concurrent inserts/deletes during paging may duplicate or skip rows until the next resync
 * (~12s provider poll + 60s open-list safety resync — RC-7).
 */
async function fetchAllOpenSeatQueryRows(
  supabase: SupabaseClient,
): Promise<{ rows: OpenSeatQueryRow[]; error: string | null }> {
  const pages: OpenSeatQueryRow[][] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('games')
      .select(PUBLIC_OPEN_SEAT_QUERY_A_SELECT)
      .eq('play_context', 'free')
      .is('tournament_id', null)
      .eq('status', 'active')
      .is('black_player_id', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PUBLIC_OPEN_SEAT_PAGE_SIZE - 1);

    if (error) {
      return { rows: [], error: error.message || 'Could not fetch public open seats.' };
    }

    const page = (data ?? []) as OpenSeatQueryRow[];
    pages.push(page);
    if (page.length < PUBLIC_OPEN_SEAT_PAGE_SIZE) break;
    offset += PUBLIC_OPEN_SEAT_PAGE_SIZE;
  }

  return { rows: mergePaginatedRowsById(pages), error: null };
}

async function fetchSeatedRowsForHostColumnChunk(
  supabase: SupabaseClient,
  hostIds: string[],
  column: 'white_player_id' | 'black_player_id',
): Promise<{ rows: PublicOpenSeatSeatedRow[]; error: string | null }> {
  const pages: PublicOpenSeatSeatedRow[][] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('games')
      .select(PUBLIC_OPEN_SEAT_SEATED_SELECT)
      .eq('play_context', 'free')
      .is('tournament_id', null)
      .in('status', ['active', 'waiting'])
      .not('black_player_id', 'is', null)
      .in(column, hostIds)
      .order('id', { ascending: true })
      .range(offset, offset + PUBLIC_OPEN_SEAT_PAGE_SIZE - 1);

    if (error) {
      return { rows: [], error: error.message || 'Could not fetch host seated rows.' };
    }

    const page = (data ?? []) as PublicOpenSeatSeatedRow[];
    pages.push(page);
    if (page.length < PUBLIC_OPEN_SEAT_PAGE_SIZE) break;
    offset += PUBLIC_OPEN_SEAT_PAGE_SIZE;
  }

  return { rows: mergePaginatedRowsById(pages), error: null };
}

/**
 * Targeted host-busy seated rows for the given host IDs (RC-3 chunking).
 * Duplicates freePlayFindMatch host-busy query shape (RC-6 — no matchmaking edits).
 */
export async function fetchSeatedRowsForHosts(
  supabase: SupabaseClient,
  hostIds: string[],
): Promise<{ rows: PublicOpenSeatSeatedRow[]; error: string | null }> {
  const chunks = chunkUniqueHostIds(hostIds);
  if (chunks.length === 0) {
    return { rows: [], error: null };
  }

  const merged = new Map<string, PublicOpenSeatSeatedRow>();
  for (const chunk of chunks) {
    for (const column of ['white_player_id', 'black_player_id'] as const) {
      const { rows, error } = await fetchSeatedRowsForHostColumnChunk(supabase, chunk, column);
      if (error) {
        return { rows: [], error };
      }
      for (const row of rows) {
        merged.set(row.id, row);
      }
    }
  }

  return { rows: [...merged.values()], error: null };
}

/** Full public open-seat lobby inventory sync (RC-4: null inventory + error on any failure). */
export async function fetchPublicOpenSeatLobbyInventory(
  supabase: SupabaseClient,
): Promise<FetchPublicOpenSeatLobbyInventoryResult> {
  const { rows: openSeatRows, error: openErr } = await fetchAllOpenSeatQueryRows(supabase);
  if (openErr) {
    return { inventory: null, error: openErr };
  }

  const inventoryDraft = buildPublicOpenSeatLobbyInventory(openSeatRows, []);
  const hostIds = inventoryDraft.openCandidates.map((r) => r.white_player_id);

  const { rows: seatedForBusy, error: seatedErr } = await fetchSeatedRowsForHosts(supabase, hostIds);
  if (seatedErr) {
    return { inventory: null, error: seatedErr };
  }

  return {
    inventory: buildPublicOpenSeatLobbyInventory(openSeatRows, seatedForBusy),
    error: null,
  };
}
