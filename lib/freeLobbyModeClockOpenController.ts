import type { FetchPublicOpenSeatLobbyInventoryResult } from '@/lib/fetchPublicOpenSeatLobbyInventory';
import { filterPublicVisibleOpenSeats } from '@/lib/freeLobbyOpenSeatFilters';
import {
  countOpenSeatsByClockAndLane,
  emptyClockLaneCountsForMode,
  type OpenSeatClockLaneCounts,
} from '@/lib/lobbyModeClockActivity';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';

export type FreeLobbyModeClockOpenSnapshot = {
  openByClock: Record<string, OpenSeatClockLaneCounts>;
  openLoading: boolean;
  hasGoodInventory: boolean;
  modeGeneration: number;
  mode: PlatMode;
};

export type FreeLobbyModeClockOpenControllerDeps = {
  fetchInventory: () => Promise<FetchPublicOpenSeatLobbyInventoryResult>;
  onChange?: (snapshot: FreeLobbyModeClockOpenSnapshot) => void;
};

/**
 * Production sync engine for mode-room open-by-clock counts.
 * Generation-safe: obsolete mode fetches never commit; pending replay uses current mode.
 */
export function createFreeLobbyModeClockOpenController(
  initialMode: PlatMode,
  deps: FreeLobbyModeClockOpenControllerDeps,
) {
  let mode: PlatMode = initialMode;
  let modeGeneration = 0;
  let inFlight = false;
  let pendingReplay = false;
  let openByClock = emptyClockLaneCountsForMode(mode);
  let openLoading = true;
  let hasGoodInventory = false;
  let disposed = false;

  function snapshot(): FreeLobbyModeClockOpenSnapshot {
    return {
      openByClock: { ...openByClock },
      openLoading,
      hasGoodInventory,
      modeGeneration,
      mode,
    };
  }

  function emit() {
    if (disposed) return;
    deps.onChange?.(snapshot());
  }

  async function refetchOpen(): Promise<void> {
    if (disposed) return;
    if (inFlight) {
      pendingReplay = true;
      return;
    }

    const myGen = modeGeneration;
    const myMode = mode;
    inFlight = true;
    try {
      const { inventory, error } = await deps.fetchInventory();
      if (disposed || myGen !== modeGeneration) return;

      if (error || !inventory) {
        if (hasGoodInventory) {
          openLoading = false;
          emit();
        }
        // First-load failure: keep openLoading true (not confirmed zero).
        return;
      }

      const visible = filterPublicVisibleOpenSeats(
        inventory.openCandidates,
        inventory.seatedForBusy,
        myMode,
      );
      // Re-check after filter work; mode must still match.
      if (disposed || myGen !== modeGeneration) return;

      openByClock = countOpenSeatsByClockAndLane(myMode, visible);
      hasGoodInventory = true;
      openLoading = false;
      emit();
    } finally {
      inFlight = false;
      if (disposed) return;
      const stale = myGen !== modeGeneration;
      const replay = pendingReplay;
      pendingReplay = false;
      if (stale || replay) {
        void refetchOpen();
      }
    }
  }

  function setMode(next: PlatMode): void {
    if (disposed) return;
    mode = next;
    modeGeneration += 1;
    openByClock = emptyClockLaneCountsForMode(next);
    openLoading = true;
    hasGoodInventory = false;
    emit();
    if (inFlight) {
      pendingReplay = true;
      return;
    }
    void refetchOpen();
  }

  function requestNotifyResync(): void {
    if (disposed) return;
    if (inFlight) {
      pendingReplay = true;
      return;
    }
    void refetchOpen();
  }

  function dispose() {
    disposed = true;
  }

  return {
    snapshot,
    setMode,
    refetchOpen,
    requestNotifyResync,
    dispose,
    getModeGeneration: () => modeGeneration,
    getMode: () => mode,
  };
}

export type FreeLobbyModeClockOpenController = ReturnType<typeof createFreeLobbyModeClockOpenController>;
