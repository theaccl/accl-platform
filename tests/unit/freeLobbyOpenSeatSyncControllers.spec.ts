import { expect, test } from '@playwright/test';

import type { FetchPublicOpenSeatLobbyInventoryResult } from '@/lib/fetchPublicOpenSeatLobbyInventory';
import {
  applyHubInventoryResult,
  createFreeLobbyOpenSeatListController,
  mergeOpenSeatRows,
  type FreeLobbyOpenSeatListRow,
  type FreeLobbyOpenSeatListSnapshot,
} from '@/lib/freeLobbyOpenSeatListController';
import { createFreeLobbyModeClockOpenController } from '@/lib/freeLobbyModeClockOpenController';
import { countPublicVisibleOpenSeatsByPlatMode } from '@/lib/freeLobbyOpenSeatFilters';
import type { PublicOpenSeatLobbyRow, PublicOpenSeatSeatedRow } from '@/lib/freeLobbyOpenSeatFilters';
import { emptyClockLaneCountsForMode } from '@/lib/lobbyModeClockActivity';

function defer<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(times = 20) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

function openRow(
  id: string,
  host: string,
  mode: 'rapid' | 'blitz' = 'rapid',
): PublicOpenSeatLobbyRow {
  return {
    id,
    white_player_id: host,
    black_player_id: null,
    tempo: 'live',
    live_time_control: mode === 'rapid' ? '10m' : '5m',
    created_at: '2026-01-01T00:00:00.000Z',
    rated: true,
    status: 'active',
    play_context: 'free',
    tournament_id: null,
  };
}

function inventoryOf(
  opens: PublicOpenSeatLobbyRow[],
  seated: PublicOpenSeatSeatedRow[] = [],
): FetchPublicOpenSeatLobbyInventoryResult {
  return { inventory: { openCandidates: opens, seatedForBusy: seated }, error: null };
}

test.describe('freeLobbyOpenSeatListController (production sync seam)', () => {
  test('BLK-1: unresolved scope-A sync cannot commit after filter changes to scope B; replay uses B', async () => {
    const aGate = defer<FetchPublicOpenSeatLobbyInventoryResult>();
    const bGate = defer<FetchPublicOpenSeatLobbyInventoryResult>();
    let fetchCount = 0;
    const snaps: FreeLobbyOpenSeatListSnapshot[] = [];

    const ctrl = createFreeLobbyOpenSeatListController(
      { mode: 'rapid', selectedClock: '10m', selectedRated: true },
      {
        fetchInventory: async () => {
          fetchCount += 1;
          if (fetchCount === 1) return aGate.promise;
          return bGate.promise;
        },
        fetchSeatedForHosts: async () => ({ rows: [], error: null }),
        onChange: (s) => snaps.push({ ...s, raw: [...s.raw] }),
      },
    );

    void ctrl.runFullSync();
    await flushMicrotasks();
    expect(fetchCount).toBe(1);
    expect(ctrl.snapshot().loading).toBe(true);

    // Change to blitz while A is unresolved.
    ctrl.setFilterScope({ mode: 'blitz', selectedClock: '5m', selectedRated: true });
    expect(ctrl.getScope().mode).toBe('blitz');
    expect(ctrl.snapshot().loading).toBe(true);

    // Resolve A — must not commit rapid rows as blitz authority.
    aGate.resolve(inventoryOf([openRow('rapid-only', 'h1', 'rapid')]));
    await flushMicrotasks();

    expect(ctrl.snapshot().raw.some((r) => r.id === 'rapid-only')).toBe(false);
    expect(ctrl.getScope().mode).toBe('blitz');
    // Replay started for B
    expect(fetchCount).toBe(2);

    bGate.resolve(inventoryOf([openRow('blitz-only', 'h2', 'blitz')]));
    await flushMicrotasks();

    const finalSnap = ctrl.snapshot();
    expect(finalSnap.loading).toBe(false);
    expect(finalSnap.raw.map((r) => r.id)).toEqual(['blitz-only']);
    expect(finalSnap.raw.some((r) => r.id === 'rapid-only')).toBe(false);
    // Never represented A as the settled result for B (no rapid-only while loading false under blitz).
    const bad = snaps.filter(
      (s) => !s.loading && s.raw.some((r) => r.id === 'rapid-only') && s.raw.every((r) => r.live_time_control === '10m'),
    );
    expect(bad).toHaveLength(0);
    ctrl.dispose();
  });

  test('BLK-3A: insert → delete → verification resolves → seat remains absent', async () => {
    const seatedGate = defer<{ rows: PublicOpenSeatSeatedRow[]; error: string | null }>();
    let seatedCalls = 0;
    const ctrl = createFreeLobbyOpenSeatListController(
      { mode: 'rapid', selectedClock: '10m', selectedRated: true },
      {
        fetchInventory: async () => inventoryOf([]),
        fetchSeatedForHosts: async () => {
          seatedCalls += 1;
          return seatedGate.promise;
        },
      },
    );
    await ctrl.runFullSync();

    ctrl.onGameInsert({
      id: 'seat-1',
      white_player_id: 'unchecked-host',
      black_player_id: null,
      tempo: 'live',
      live_time_control: '10m',
      rated: true,
      status: 'active',
      play_context: 'free',
      tournament_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(ctrl.getPendingCandidateIds()).toContain('seat-1');
    expect(ctrl.snapshot().raw).toHaveLength(0);

    ctrl.onGameDelete('seat-1');
    expect(ctrl.getDeletedSeatIds()).toContain('seat-1');
    expect(ctrl.getPendingCandidateIds()).not.toContain('seat-1');

    seatedGate.resolve({ rows: [], error: null });
    await flushMicrotasks();

    expect(ctrl.snapshot().raw.some((r) => r.id === 'seat-1')).toBe(false);
    expect(seatedCalls).toBe(1);
    ctrl.dispose();
  });

  test('BLK-3B: insert → verification resolves without delete → visible when eligible', async () => {
    const seatedGate = defer<{ rows: PublicOpenSeatSeatedRow[]; error: string | null }>();
    const ctrl = createFreeLobbyOpenSeatListController(
      { mode: 'rapid', selectedClock: '10m', selectedRated: true },
      {
        fetchInventory: async () => inventoryOf([]),
        fetchSeatedForHosts: async () => seatedGate.promise,
      },
    );
    await ctrl.runFullSync();

    ctrl.onGameInsert({
      id: 'seat-ok',
      white_player_id: 'free-host',
      black_player_id: null,
      tempo: 'live',
      live_time_control: '10m',
      rated: true,
      status: 'active',
      play_context: 'free',
      tournament_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(ctrl.snapshot().raw).toHaveLength(0);
    expect(ctrl.getPendingCandidateIds()).toContain('seat-ok');

    seatedGate.resolve({ rows: [], error: null });
    await flushMicrotasks();

    expect(ctrl.getCheckedHostIds()).toContain('free-host');
    expect(ctrl.snapshot().raw.map((r) => r.id)).toEqual(['seat-ok']);
    ctrl.dispose();
  });

  test('BLK-3C: successful full sync invalidates older pending verification', async () => {
    const seatedGate = defer<{ rows: PublicOpenSeatSeatedRow[]; error: string | null }>();
    const sync2 = defer<FetchPublicOpenSeatLobbyInventoryResult>();
    let invCalls = 0;
    const ctrl = createFreeLobbyOpenSeatListController(
      { mode: 'rapid', selectedClock: '10m', selectedRated: true },
      {
        fetchInventory: async () => {
          invCalls += 1;
          if (invCalls === 1) return inventoryOf([]);
          return sync2.promise;
        },
        fetchSeatedForHosts: async () => seatedGate.promise,
      },
    );
    await ctrl.runFullSync();

    ctrl.onGameInsert({
      id: 'stale-seat',
      white_player_id: 'host-x',
      black_player_id: null,
      tempo: 'live',
      live_time_control: '10m',
      rated: true,
      status: 'active',
      play_context: 'free',
      tournament_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });

    // Full sync commits authoritative inventory while verification still pending.
    void ctrl.runFullSync();
    await flushMicrotasks(5);
    sync2.resolve(inventoryOf([openRow('from-sync', 'sync-host', 'rapid')]));
    await flushMicrotasks();

    expect(ctrl.snapshot().raw.map((r) => r.id)).toEqual(['from-sync']);

    // Late verification must be a no-op (cannot reinsert stale-seat / overwrite sync).
    seatedGate.resolve({ rows: [], error: null });
    await flushMicrotasks();

    expect(ctrl.snapshot().raw.map((r) => r.id)).toEqual(['from-sync']);
    expect(ctrl.snapshot().raw.some((r) => r.id === 'stale-seat')).toBe(false);
    ctrl.dispose();
  });

  test('BLK-3D: multiple inserts for one unchecked host share one targeted lookup', async () => {
    const seatedGate = defer<{ rows: PublicOpenSeatSeatedRow[]; error: string | null }>();
    let seatedCalls = 0;
    const ctrl = createFreeLobbyOpenSeatListController(
      { mode: 'rapid', selectedClock: '10m', selectedRated: true },
      {
        fetchInventory: async () => inventoryOf([]),
        fetchSeatedForHosts: async () => {
          seatedCalls += 1;
          return seatedGate.promise;
        },
      },
    );
    await ctrl.runFullSync();

    ctrl.onGameInsert({
      id: 'a',
      white_player_id: 'same-host',
      black_player_id: null,
      tempo: 'live',
      live_time_control: '10m',
      rated: true,
      status: 'active',
      play_context: 'free',
      tournament_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    ctrl.onGameInsert({
      id: 'b',
      white_player_id: 'same-host',
      black_player_id: null,
      tempo: 'live',
      live_time_control: '10m',
      rated: true,
      status: 'active',
      play_context: 'free',
      tournament_id: null,
      created_at: '2026-01-01T00:00:01.000Z',
    });

    expect(seatedCalls).toBe(1);
    expect(ctrl.getHostVerifyInFlightCount()).toBe(1);

    seatedGate.resolve({ rows: [], error: null });
    await flushMicrotasks();

    expect(ctrl.snapshot().raw.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(seatedCalls).toBe(1);
    ctrl.dispose();
  });

  test('mergeOpenSeatRows sorts equal created_at by id tie-break', () => {
    const a: FreeLobbyOpenSeatListRow = {
      id: 'b-id',
      white_player_id: 'h',
      tempo: 'live',
      live_time_control: '10m',
      created_at: '2026-01-01T00:00:00.000Z',
      rated: true,
      hostUsername: null,
    };
    const b: FreeLobbyOpenSeatListRow = {
      id: 'a-id',
      white_player_id: 'h2',
      tempo: 'live',
      live_time_control: '10m',
      created_at: '2026-01-01T00:00:00.000Z',
      rated: true,
      hostUsername: null,
    };
    const merged = mergeOpenSeatRows([a], b);
    expect(merged.map((r) => r.id)).toEqual(['a-id', 'b-id']);
  });

  test('first-load failure keeps loading true (not confirmed zero)', async () => {
    const ctrl = createFreeLobbyOpenSeatListController(
      { mode: 'rapid', selectedClock: '10m', selectedRated: true },
      {
        fetchInventory: async () => ({ inventory: null, error: 'boom' }),
        fetchSeatedForHosts: async () => ({ rows: [], error: null }),
      },
    );
    await ctrl.runFullSync();
    const snap = ctrl.snapshot();
    expect(snap.hasGoodInventory).toBe(false);
    expect(snap.loading).toBe(true);
    expect(snap.raw).toEqual([]);
    ctrl.dispose();
  });

  test('previous-good inventory survives later sync failure', async () => {
    let calls = 0;
    const ctrl = createFreeLobbyOpenSeatListController(
      { mode: 'rapid', selectedClock: '10m', selectedRated: true },
      {
        fetchInventory: async () => {
          calls += 1;
          if (calls === 1) return inventoryOf([openRow('kept', 'h1', 'rapid')]);
          return { inventory: null, error: 'later-fail' };
        },
        fetchSeatedForHosts: async () => ({ rows: [], error: null }),
      },
    );
    await ctrl.runFullSync();
    expect(ctrl.snapshot().raw.map((r) => r.id)).toEqual(['kept']);
    await ctrl.runFullSync();
    expect(ctrl.snapshot().raw.map((r) => r.id)).toEqual(['kept']);
    expect(ctrl.snapshot().error).toBe('later-fail');
    expect(ctrl.snapshot().hasGoodInventory).toBe(true);
    ctrl.dispose();
  });
});

test.describe('freeLobbyModeClockOpenController (production sync seam)', () => {
  test('BLK-2: mode-A fetch cannot commit after switch to mode B; replay uses B', async () => {
    const aGate = defer<FetchPublicOpenSeatLobbyInventoryResult>();
    const bGate = defer<FetchPublicOpenSeatLobbyInventoryResult>();
    let fetchCount = 0;

    const ctrl = createFreeLobbyModeClockOpenController('rapid', {
      fetchInventory: async () => {
        fetchCount += 1;
        if (fetchCount === 1) return aGate.promise;
        return bGate.promise;
      },
    });

    void ctrl.refetchOpen();
    await flushMicrotasks();
    expect(fetchCount).toBe(1);

    ctrl.setMode('blitz');
    expect(ctrl.getMode()).toBe('blitz');
    expect(ctrl.snapshot().openLoading).toBe(true);
    expect(ctrl.snapshot().openByClock).toEqual(emptyClockLaneCountsForMode('blitz'));

    aGate.resolve(inventoryOf([openRow('rapid-seat', 'h1', 'rapid')]));
    await flushMicrotasks();

    // Mode-A counts must not commit onto blitz state.
    expect(ctrl.snapshot().openByClock['10m']?.total ?? 0).toBe(0);
    expect(fetchCount).toBe(2);

    bGate.resolve(inventoryOf([openRow('blitz-seat', 'h2', 'blitz')]));
    await flushMicrotasks();

    expect(ctrl.snapshot().openLoading).toBe(false);
    expect(ctrl.snapshot().openByClock['5m']?.total).toBe(1);
    expect(ctrl.snapshot().openByClock['10m']?.total ?? 0).toBe(0);
    ctrl.dispose();
  });
});

test.describe('applyHubInventoryResult', () => {
  test('null inventory on first load stays loading (not confirmed zero)', () => {
    const next = applyHubInventoryResult({
      inventory: null,
      error: 'fail',
      priorCounts: { bullet: 0, blitz: 0, rapid: 0, daily: 0 },
      hasGoodInventory: false,
      countFn: countPublicVisibleOpenSeatsByPlatMode,
    });
    expect(next.loading).toBe(true);
    expect(next.hasGoodInventory).toBe(false);
  });

  test('prior good counts retained on later failure', () => {
    const prior = { bullet: 0, blitz: 0, rapid: 3, daily: 0 };
    const next = applyHubInventoryResult({
      inventory: null,
      error: 'fail',
      priorCounts: prior,
      hasGoodInventory: true,
      countFn: countPublicVisibleOpenSeatsByPlatMode,
    });
    expect(next.counts).toEqual(prior);
    expect(next.loading).toBe(false);
  });
});
