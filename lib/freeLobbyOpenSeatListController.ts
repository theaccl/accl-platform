import type {
  FetchPublicOpenSeatLobbyInventoryResult,
  PublicOpenSeatLobbyInventory,
} from '@/lib/fetchPublicOpenSeatLobbyInventory';
import { mergeSeatedRowsById } from '@/lib/fetchPublicOpenSeatLobbyInventory';
import {
  filterPublicVisibleOpenSeats,
  isBotHostedPublicOpenSeat,
  isPublicUnmatchedOpenSeatRow,
  type PublicOpenSeatSeatedRow,
} from '@/lib/freeLobbyOpenSeatFilters';
import type { FreeOpenSeatRow } from '@/lib/freePlayOpenSeatsFilter';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';

export type FreeLobbyOpenSeatListRow = FreeOpenSeatRow & {
  hostUsername: string | null;
};

export type FreeLobbyOpenSeatFilterScope = {
  mode: PlatMode;
  selectedClock: string;
  selectedRated: boolean;
};

export type FreeLobbyOpenSeatListSnapshot = {
  raw: FreeLobbyOpenSeatListRow[];
  loading: boolean;
  error: string | null;
  hasGoodInventory: boolean;
  scopeGeneration: number;
  inventoryGeneration: number;
};

export type FreeLobbyOpenSeatRtInsert = {
  id: string;
  white_player_id?: string | null;
  black_player_id?: string | null;
  tempo?: string | null;
  live_time_control?: string | null;
  created_at?: string | null;
  rated?: boolean | null;
  status?: string | null;
  play_context?: string | null;
  tournament_id?: string | null;
};

type PendingCandidate = {
  id: string;
  hostId: string;
  row: FreeLobbyOpenSeatRtInsert;
  inventoryGeneration: number;
};

export type FreeLobbyOpenSeatListControllerDeps = {
  fetchInventory: () => Promise<FetchPublicOpenSeatLobbyInventoryResult>;
  fetchSeatedForHosts: (
    hostIds: string[],
  ) => Promise<{ rows: PublicOpenSeatSeatedRow[]; error: string | null }>;
  resolveHostnames?: (
    hostIds: string[],
  ) => Promise<Map<string, string | null>>;
  now?: () => number;
  onChange?: (snapshot: FreeLobbyOpenSeatListSnapshot) => void;
};

/** Deterministic open-seat merge: created_at ASC, id ASC tie-break. */
export function mergeOpenSeatRows(
  prev: FreeLobbyOpenSeatListRow[],
  nextSeat: FreeLobbyOpenSeatListRow,
): FreeLobbyOpenSeatListRow[] {
  return [...prev.filter((r) => r.id !== nextSeat.id), nextSeat].sort((a, b) => {
    const ca = String(a.created_at ?? '');
    const cb = String(b.created_at ?? '');
    const byCreated = ca.localeCompare(cb);
    if (byCreated !== 0) return byCreated;
    return String(a.id).localeCompare(String(b.id));
  });
}

function isOpenSeatLike(r: FreeLobbyOpenSeatRtInsert): boolean {
  if (typeof r.id !== 'string' || typeof r.white_player_id !== 'string') return false;
  return isPublicUnmatchedOpenSeatRow({
    play_context: r.play_context,
    tournament_id: r.tournament_id,
    status: r.status,
    black_player_id: r.black_player_id,
    tempo: r.tempo ?? null,
    live_time_control: r.live_time_control ?? null,
  });
}

/**
 * Production sync engine for public open-seat list state.
 * Hooks hold one instance and forward filter / realtime / notify events.
 */
export function createFreeLobbyOpenSeatListController(
  initialScope: FreeLobbyOpenSeatFilterScope,
  deps: FreeLobbyOpenSeatListControllerDeps,
) {
  const now = deps.now ?? (() => Date.now());

  let scope = { ...initialScope };
  let scopeGeneration = 0;
  let inventoryGeneration = 0;
  let inFlight = false;
  let pendingReplay = false;
  let pendingInitial = true;
  let raw: FreeLobbyOpenSeatListRow[] = [];
  let loading = true;
  let error: string | null = null;
  let hasGoodInventory = false;
  let seatedRows: PublicOpenSeatSeatedRow[] = [];
  const checkedHostIds = new Set<string>();
  const deletedSeatIds = new Set<string>();
  const pendingCandidates = new Map<string, PendingCandidate>();
  const hostVerifyInFlight = new Map<string, Promise<void>>();
  let lastFullSyncAt = 0;
  let disposed = false;

  const profileCache = new Map<string, string | null>();

  function snapshot(): FreeLobbyOpenSeatListSnapshot {
    return {
      raw: [...raw],
      loading,
      error,
      hasGoodInventory,
      scopeGeneration,
      inventoryGeneration,
    };
  }

  function emit() {
    if (disposed) return;
    deps.onChange?.(snapshot());
  }

  function applyPublicFilters(rows: FreeLobbyOpenSeatListRow[]): FreeLobbyOpenSeatListRow[] {
    return filterPublicVisibleOpenSeats(rows, seatedRows, scope.mode);
  }

  function commitVerifiedSeat(row: FreeLobbyOpenSeatRtInsert, id: string) {
    if (disposed) return;
    if (deletedSeatIds.has(id)) return;
    const nextSeat: FreeLobbyOpenSeatListRow = {
      id,
      white_player_id: String(row.white_player_id),
      tempo: row.tempo ?? null,
      live_time_control: row.live_time_control ?? null,
      created_at: row.created_at ?? new Date(now()).toISOString(),
      rated: row.rated ?? false,
      hostUsername: profileCache.get(String(row.white_player_id)) ?? null,
    };
    raw = applyPublicFilters(mergeOpenSeatRows(raw, nextSeat));
    emit();
  }

  async function attachHostnames(
    afterBusy: FreeOpenSeatRow[],
    myScopeGen: number,
  ): Promise<FreeLobbyOpenSeatListRow[] | null> {
    const ids = [...new Set(afterBusy.map((r) => r.white_player_id).filter(Boolean))];
    if (ids.length > 0 && deps.resolveHostnames) {
      const missing = ids.filter((id) => !profileCache.has(id));
      if (missing.length > 0) {
        const resolved = await deps.resolveHostnames(missing);
        if (myScopeGen !== scopeGeneration || disposed) return null;
        for (const [id, name] of resolved) {
          profileCache.set(id, name);
        }
      }
    }
    if (myScopeGen !== scopeGeneration || disposed) return null;
    return afterBusy.map((r) => ({
      ...r,
      hostUsername: profileCache.get(r.white_player_id) ?? null,
    }));
  }

  async function runFullSync(): Promise<void> {
    if (disposed) return;
    if (inFlight) {
      pendingReplay = true;
      return;
    }

    const myScopeGen = scopeGeneration;
    const isInitial = pendingInitial;
    if (isInitial) pendingInitial = false;

    inFlight = true;
    try {
      if (isInitial) {
        loading = true;
        emit();
      }
      // Do not clear error until a known outcome (hardening #4).

      const { inventory, error: syncErr } = await deps.fetchInventory();
      if (disposed || myScopeGen !== scopeGeneration) return;

      if (syncErr || !inventory) {
        error = syncErr ?? 'Could not load public open seats.';
        // First-load failure: keep loading true (not confirmed zero).
        // Subsequent failure: retain raw; clear loading only if we already had good inventory.
        if (hasGoodInventory && isInitial) {
          loading = false;
        }
        emit();
        return;
      }

      inventoryGeneration += 1;
      const myInvGen = inventoryGeneration;

      // Invalidate older pending verifications (BLK-3).
      for (const [id, pending] of [...pendingCandidates.entries()]) {
        if (pending.inventoryGeneration < myInvGen) {
          pendingCandidates.delete(id);
        }
      }
      deletedSeatIds.clear();

      seatedRows = inventory.seatedForBusy;
      checkedHostIds.clear();
      for (const r of inventory.openCandidates) {
        checkedHostIds.add(r.white_player_id);
      }

      const afterBusy = filterPublicVisibleOpenSeats(
        inventory.openCandidates,
        inventory.seatedForBusy,
        scope.mode,
      );
      const withNames = await attachHostnames(afterBusy, myScopeGen);
      if (!withNames || disposed || myScopeGen !== scopeGeneration) return;

      raw = withNames;
      hasGoodInventory = true;
      error = null;
      loading = false;
      lastFullSyncAt = now();
      emit();
    } finally {
      inFlight = false;
      if (disposed) return;
      const stale = myScopeGen !== scopeGeneration;
      const replay = pendingReplay;
      pendingReplay = false;
      if (stale || replay) {
        // Always re-enter via current controller state (latest scope), never a stale closure.
        void runFullSync();
      }
    }
  }

  function setFilterScope(next: FreeLobbyOpenSeatFilterScope): void {
    if (disposed) return;
    scope = { ...next };
    scopeGeneration += 1;
    pendingInitial = true;
    loading = true;
    // Invalidate pending verifications tied to prior inventory generation by bumping scope;
    // they also check scopeGeneration on completion.
    emit();
    if (inFlight) {
      pendingReplay = true;
      return;
    }
    void runFullSync();
  }

  function requestNotifyResync(minGapMs = 1_500): void {
    if (disposed) return;
    if (now() - lastFullSyncAt < 0) return;
    // Debounce is caller-owned for RT; allow immediate when invoked from controller tests.
    void minGapMs;
    if (inFlight) {
      pendingReplay = true;
      return;
    }
    void runFullSync();
  }

  function onGameDelete(idRaw: string): void {
    if (disposed) return;
    const id = String(idRaw ?? '').trim();
    if (!id) return;
    deletedSeatIds.add(id);
    pendingCandidates.delete(id);
    raw = raw.filter((r) => r.id !== id);
    emit();
  }

  async function verifyHostAndMaybeApply(hostId: string, seedIds: string[]): Promise<void> {
    const existing = hostVerifyInFlight.get(hostId);
    if (existing) {
      await existing;
      // After shared verify completes, apply any still-pending candidates for this host.
      for (const id of seedIds) {
        const pending = pendingCandidates.get(id);
        if (!pending) continue;
        if (pending.inventoryGeneration !== inventoryGeneration) {
          pendingCandidates.delete(id);
          continue;
        }
        if (deletedSeatIds.has(id)) {
          pendingCandidates.delete(id);
          continue;
        }
        if (checkedHostIds.has(hostId)) {
          pendingCandidates.delete(id);
          commitVerifiedSeat(pending.row, id);
        }
      }
      return;
    }

    const capturedInvGen = inventoryGeneration;
    const capturedScopeGen = scopeGeneration;
    const work = (async () => {
      const { rows: seated, error: seatedErr } = await deps.fetchSeatedForHosts([hostId]);
      if (disposed) return;
      if (capturedScopeGen !== scopeGeneration) return;
      if (capturedInvGen !== inventoryGeneration) return;
      if (seatedErr) {
        // Keep candidates pending until a later successful full sync / verify.
        return;
      }

      seatedRows = mergeSeatedRowsById([...seatedRows, ...seated]);
      checkedHostIds.add(hostId);

      for (const [id, pending] of [...pendingCandidates.entries()]) {
        if (pending.hostId !== hostId) continue;
        if (pending.inventoryGeneration !== inventoryGeneration) {
          pendingCandidates.delete(id);
          continue;
        }
        if (deletedSeatIds.has(id)) {
          pendingCandidates.delete(id);
          continue;
        }
        pendingCandidates.delete(id);
        commitVerifiedSeat(pending.row, id);
      }
    })();

    hostVerifyInFlight.set(hostId, work);
    try {
      await work;
    } finally {
      hostVerifyInFlight.delete(hostId);
    }
  }

  function onGameInsert(row: FreeLobbyOpenSeatRtInsert): void {
    if (disposed) return;
    const id = String(row.id ?? '').trim();
    if (!id) return;

    if (row.black_player_id) {
      seatedRows = mergeSeatedRowsById([
        ...seatedRows.filter((r) => r.id !== id),
        {
          id,
          white_player_id: String(row.white_player_id ?? ''),
          black_player_id: String(row.black_player_id ?? ''),
          tempo: row.tempo ?? null,
          live_time_control: row.live_time_control ?? null,
          rated: row.rated ?? null,
          status: row.status ?? null,
        },
      ]);
      deletedSeatIds.add(id);
      pendingCandidates.delete(id);
      raw = applyPublicFilters(raw.filter((r) => r.id !== id));
      emit();
      return;
    }

    if (!isOpenSeatLike(row) || isBotHostedPublicOpenSeat({ white_player_id: String(row.white_player_id) })) {
      return;
    }

    const hostId = String(row.white_player_id ?? '').trim();
    if (!hostId) return;
    if (deletedSeatIds.has(id)) return;

    if (checkedHostIds.has(hostId)) {
      commitVerifiedSeat(row, id);
      return;
    }

    pendingCandidates.set(id, {
      id,
      hostId,
      row,
      inventoryGeneration,
    });
    void verifyHostAndMaybeApply(hostId, [id]);
  }

  /** Optional 60s safety: only when explicitly requested by the RT subscriber path. */
  function maybeRequestStaleSafetyResync(maxAgeMs = 60_000): boolean {
    if (now() - lastFullSyncAt > maxAgeMs) {
      requestNotifyResync(0);
      return true;
    }
    return false;
  }

  function dispose() {
    disposed = true;
    pendingCandidates.clear();
    hostVerifyInFlight.clear();
  }

  return {
    snapshot,
    setFilterScope,
    runFullSync,
    requestNotifyResync,
    onGameInsert,
    onGameDelete,
    maybeRequestStaleSafetyResync,
    dispose,
    /** Test / debug seams */
    getPendingCandidateIds: () => [...pendingCandidates.keys()],
    getDeletedSeatIds: () => [...deletedSeatIds],
    getCheckedHostIds: () => [...checkedHostIds],
    getHostVerifyInFlightCount: () => hostVerifyInFlight.size,
    getScope: () => ({ ...scope }),
    getInventoryGeneration: () => inventoryGeneration,
    getScopeGeneration: () => scopeGeneration,
  };
}

export type FreeLobbyOpenSeatListController = ReturnType<typeof createFreeLobbyOpenSeatListController>;

/** Apply inventory success/failure into hub-style counts without fabricating first-load zeros. */
export function applyHubInventoryResult(args: {
  inventory: PublicOpenSeatLobbyInventory | null;
  error: string | null;
  priorCounts: Record<PlatMode, number>;
  hasGoodInventory: boolean;
  countFn: (
    openCandidates: PublicOpenSeatLobbyInventory['openCandidates'],
    seatedForBusy: PublicOpenSeatLobbyInventory['seatedForBusy'],
  ) => Record<PlatMode, number>;
}): {
  counts: Record<PlatMode, number>;
  loading: boolean;
  hasGoodInventory: boolean;
} {
  if (args.error || !args.inventory) {
    if (args.hasGoodInventory) {
      return { counts: args.priorCounts, loading: false, hasGoodInventory: true };
    }
    return { counts: args.priorCounts, loading: true, hasGoodInventory: false };
  }
  return {
    counts: args.countFn(args.inventory.openCandidates, args.inventory.seatedForBusy),
    loading: false,
    hasGoodInventory: true,
  };
}
