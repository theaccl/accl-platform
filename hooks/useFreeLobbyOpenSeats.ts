'use client';

import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  FreePlayLobbyGamesRealtimeContext,
  type FreeLobbyGamesRtEvent,
} from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import {
  fetchPublicOpenSeatLobbyInventory,
  fetchSeatedRowsForHosts,
} from '@/lib/fetchPublicOpenSeatLobbyInventory';
import {
  createFreeLobbyOpenSeatListController,
  type FreeLobbyOpenSeatListRow,
  type FreeLobbyOpenSeatListSnapshot,
} from '@/lib/freeLobbyOpenSeatListController';
import {
  openSeatMatchesPlatClock,
  openSeatMatchesPlatMode,
  openSeatMatchesRated,
} from '@/lib/freePlayOpenSeatsFilter';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import { supabase } from '@/lib/supabaseClient';

export type FreeLobbyOpenSeatRow = FreeLobbyOpenSeatListRow;

type DebugWindow = Window & {
  __accl_debug?: {
    gamesFetchCount: number;
    gamesFetchTotalMs: number;
    gamesFetchAvgMs: number;
    gamesFetchPerMinute: number;
    updatedAt: number;
  };
};

function bumpGamesFetchDebug(ms: number) {
  if (typeof window === 'undefined') return;
  const w = window as DebugWindow;
  const prev = w.__accl_debug ?? {
    gamesFetchCount: 0,
    gamesFetchTotalMs: 0,
    gamesFetchAvgMs: 0,
    gamesFetchPerMinute: 0,
    updatedAt: Date.now(),
  };
  const nextCount = prev.gamesFetchCount + 1;
  const nextTotal = prev.gamesFetchTotalMs + ms;
  w.__accl_debug = {
    gamesFetchCount: nextCount,
    gamesFetchTotalMs: nextTotal,
    gamesFetchAvgMs: Math.round((nextTotal / nextCount) * 10) / 10,
    gamesFetchPerMinute: Math.round((nextCount / Math.max(1, (Date.now() - prev.updatedAt) / 60_000)) * 10) / 10,
    updatedAt: prev.updatedAt,
  };
}

/**
 * Public free-play open seats for a mode, filtered to selected time control and rated/unrated (queue view).
 * Sync races are owned by createFreeLobbyOpenSeatListController (generation-safe replay + tombstones).
 */
export function useFreeLobbyOpenSeats(
  mode: PlatMode,
  selectedClock: string,
  selectedRated: boolean,
): {
  rows: FreeLobbyOpenSeatRow[];
  loading: boolean;
  error: string | null;
} {
  const [snap, setSnap] = useState<FreeLobbyOpenSeatListSnapshot>(() => ({
    raw: [],
    loading: true,
    error: null,
    hasGoodInventory: false,
    scopeGeneration: 0,
    inventoryGeneration: 0,
  }));
  const lobbyRt = useContext(FreePlayLobbyGamesRealtimeContext);
  const lastNotifyRunAtRef = useRef(0);
  const mountedRef = useRef(true);

  const controllerRef = useRef<ReturnType<typeof createFreeLobbyOpenSeatListController> | null>(null);
  if (controllerRef.current == null) {
    controllerRef.current = createFreeLobbyOpenSeatListController(
      { mode, selectedClock, selectedRated },
      {
        fetchInventory: async () => {
          const started = Date.now();
          const result = await fetchPublicOpenSeatLobbyInventory(supabase);
          bumpGamesFetchDebug(Date.now() - started);
          return result;
        },
        fetchSeatedForHosts: (hostIds) => fetchSeatedRowsForHosts(supabase, hostIds),
        resolveHostnames: async (hostIds) => {
          const map = new Map<string, string | null>();
          if (hostIds.length === 0) return map;
          const { data, error } = await supabase.from('profiles').select('id,username').in('id', hostIds);
          if (!error && data) {
            for (const p of data) {
              map.set(p.id as string, (p.username as string | null) ?? null);
            }
          }
          return map;
        },
        onChange: (next) => {
          if (!mountedRef.current) return;
          setSnap(next);
        },
      },
    );
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setFilterScope({ mode, selectedClock, selectedRated });
  }, [mode, selectedClock, selectedRated]);

  useEffect(() => {
    if (!lobbyRt || !controllerRef.current) return;
    const ctrl = controllerRef.current;
    const unsub = lobbyRt.subscribe((event: FreeLobbyGamesRtEvent) => {
      if (event.kind === 'snapshot') {
        const nowMs = Date.now();
        if (nowMs - lastNotifyRunAtRef.current < 1_500) return;
        lastNotifyRunAtRef.current = nowMs;
        ctrl.requestNotifyResync(0);
        return;
      }
      if (event.kind === 'game_delete') {
        ctrl.onGameDelete(String(event.row.id ?? ''));
        ctrl.maybeRequestStaleSafetyResync(60_000);
        return;
      }
      if (event.kind === 'game_insert') {
        ctrl.onGameInsert(event.row);
        ctrl.maybeRequestStaleSafetyResync(60_000);
      }
    });
    return () => {
      unsub();
    };
  }, [lobbyRt]);

  const rows = useMemo(() => {
    return snap.raw.filter((r) => {
      if (!openSeatMatchesPlatMode(r, mode)) return false;
      if (!openSeatMatchesPlatClock(r, mode, selectedClock)) return false;
      return openSeatMatchesRated(r, selectedRated);
    });
  }, [snap.raw, mode, selectedClock, selectedRated]);

  return { rows, loading: snap.loading, error: snap.error };
}
