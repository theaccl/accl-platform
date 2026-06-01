'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  FreePlayLobbyGamesRealtimeContext,
  type FreeLobbyGameRtRow,
  type FreeLobbyGamesRtEvent,
} from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import {
  openSeatMatchesPlatClock,
  openSeatMatchesPlatMode,
  openSeatMatchesRated,
  type FreeOpenSeatRow,
} from '@/lib/freePlayOpenSeatsFilter';
import {
  filterPublicVisibleOpenSeats,
  isBotHostedPublicOpenSeat,
  isPublicUnmatchedOpenSeatRow,
  partitionLobbyRowsForPublicOpen,
  type PublicOpenSeatSeatedRow,
} from '@/lib/freeLobbyOpenSeatFilters';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import { supabase } from '@/lib/supabaseClient';

function lobbyGamesRtDebugEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ACCL_LOBBY_GAMES_RT_DEBUG === '1') return true;
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem('accl_lobby_games_rt_debug') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export type FreeLobbyOpenSeatRow = FreeOpenSeatRow & {
  /** Host display name when profiles load. */
  hostUsername: string | null;
};

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
  const [raw, setRaw] = useState<FreeLobbyOpenSeatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lobbyRt = useContext(FreePlayLobbyGamesRealtimeContext);

  /** Bumps on mode/clock/rated change so in-flight work cannot apply after scope changes. */
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);
  /** Next run after filter change should show loading until first successful apply. */
  const pendingInitialRef = useRef(true);
  /** Provider notified while a fetch was in flight — rerun once with current seq. */
  const pendingNotifyRef = useRef(false);
  const lastNotifyRunAtRef = useRef(0);
  const profileNameCacheRef = useRef(new Map<string, string | null>());
  const seatedRowsRef = useRef<PublicOpenSeatSeatedRow[]>([]);
  const lastFullSyncAtRef = useRef(0);

  const isOpenSeatLike = useCallback((r: FreeLobbyGameRtRow): r is FreeLobbyOpenSeatRow => {
    if (typeof r.id !== 'string' || typeof r.white_player_id !== 'string') return false;
    return isPublicUnmatchedOpenSeatRow({
      play_context: r.play_context,
      tournament_id: r.tournament_id,
      status: r.status,
      black_player_id: r.black_player_id,
      tempo: r.tempo ?? null,
      live_time_control: r.live_time_control ?? null,
    });
  }, []);

  const applyPublicOpenFilters = useCallback((rows: FreeLobbyOpenSeatRow[]) => {
    return filterPublicVisibleOpenSeats(rows, seatedRowsRef.current, mode);
  }, [mode]);

  const tryRun = useCallback(async () => {
    if (inFlightRef.current) return;
    const mySeq = seqRef.current;
    const isInitial = pendingInitialRef.current;
    if (isInitial) pendingInitialRef.current = false;

    inFlightRef.current = true;
    try {
      if (
        !isInitial &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      if (isInitial) setLoading(true);
      setError(null);
      const started = Date.now();
      const { data, error: qErr } = await supabase
        .from('games')
        .select('id,white_player_id,black_player_id,tempo,live_time_control,created_at,rated,status')
        .eq('play_context', 'free')
        .is('tournament_id', null)
        .in('status', ['active', 'waiting'])
        .order('created_at', { ascending: true })
        .limit(240);
      bumpGamesFetchDebug(Date.now() - started);

      if (mySeq !== seqRef.current) return;

      if (qErr) {
        setError(qErr.message);
        setRaw([]);
        if (isInitial) setLoading(false);
        return;
      }

      const allRows = (data ?? []) as Array<{
        id: string;
        white_player_id: string;
        black_player_id: string | null;
        tempo: string | null;
        live_time_control: string | null;
        created_at: string;
        rated: boolean | null;
        status: string | null;
      }>;
      const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen(allRows);
      seatedRowsRef.current = seatedForBusy;
      const afterBusy = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, mode);

      const ids = [...new Set(afterBusy.map((r) => r.white_player_id).filter(Boolean))];
      let nameById = new Map<string, string | null>();
      if (ids.length > 0) {
        const missingIds = ids.filter((id) => !profileNameCacheRef.current.has(id));
        if (missingIds.length > 0) {
          const { data: profs, error: pErr } = await supabase.from('profiles').select('id,username').in('id', missingIds);
          if (!pErr && profs) {
            for (const p of profs) {
              profileNameCacheRef.current.set(p.id as string, (p.username as string | null) ?? null);
            }
          }
        }
        for (const id of ids) {
          nameById.set(id, profileNameCacheRef.current.get(id) ?? null);
        }
      }

      if (mySeq !== seqRef.current) return;

      setRaw(
        afterBusy.map((r) => ({
          ...r,
          hostUsername: nameById.get(r.white_player_id) ?? null,
        })),
      );
      if (isInitial) {
        setLoading(false);
      }
      lastFullSyncAtRef.current = Date.now();
      if (lobbyGamesRtDebugEnabled() && process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.debug('[free-lobby-open-seats] refetch', {
          isInitial,
          rows: afterBusy.length,
          mode,
          clock: selectedClock,
          rated: selectedRated,
          seq: mySeq,
        });
      }
    } finally {
      inFlightRef.current = false;
      const stale = mySeq !== seqRef.current;
      const replayNotify = pendingNotifyRef.current;
      pendingNotifyRef.current = false;
      if (stale || replayNotify) {
        void tryRun();
      }
    }
  }, [mode, selectedClock, selectedRated]);

  const requestFilterResync = useCallback(() => {
    seqRef.current += 1;
    pendingInitialRef.current = true;
    if (inFlightRef.current) {
      pendingNotifyRef.current = true;
      return;
    }
    void tryRun();
  }, [tryRun]);

  const requestNotifyResync = useCallback(() => {
    const now = Date.now();
    if (now - lastNotifyRunAtRef.current < 1_500) return;
    lastNotifyRunAtRef.current = now;
    if (inFlightRef.current) {
      pendingNotifyRef.current = true;
      return;
    }
    void tryRun();
  }, [tryRun]);

  useEffect(() => {
    requestFilterResync();
  }, [mode, selectedClock, selectedRated, requestFilterResync]);

  useEffect(() => {
    if (!lobbyRt) {
      return;
    }
    const unsub = lobbyRt.subscribe((event: FreeLobbyGamesRtEvent) => {
      if (event.kind === 'snapshot') {
        requestNotifyResync();
        return;
      }
      if (event.kind === 'game_delete') {
        const id = String(event.row.id ?? '').trim();
        if (!id) return;
        setRaw((prev) => prev.filter((r) => r.id !== id));
        return;
      }
      if (event.kind === 'game_insert') {
        const row = event.row;
        const id = String(row.id ?? '').trim();
        if (!id) return;

        // Keep seated rows in-memory so open seats can be filtered without full fetch.
        if (row.black_player_id) {
          seatedRowsRef.current = [
            ...seatedRowsRef.current.filter((r) => r.id !== id),
            {
              id,
              white_player_id: String(row.white_player_id ?? ''),
              black_player_id: String(row.black_player_id ?? ''),
              tempo: row.tempo ?? null,
              live_time_control: row.live_time_control ?? null,
              rated: row.rated ?? null,
              status: row.status ?? null,
            },
          ];
          setRaw((prev) => applyPublicOpenFilters(prev.filter((r) => r.id !== id)));
          return;
        }

        if (!isOpenSeatLike(row) || isBotHostedPublicOpenSeat({ white_player_id: String(row.white_player_id) })) return;
        const nextSeat: FreeLobbyOpenSeatRow = {
          id,
          white_player_id: String(row.white_player_id),
          tempo: row.tempo ?? null,
          live_time_control: row.live_time_control ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
          rated: row.rated ?? false,
          hostUsername: profileNameCacheRef.current.get(String(row.white_player_id)) ?? null,
        };
        setRaw((prev) => {
          const merged = [...prev.filter((r) => r.id !== id), nextSeat].sort((a, b) =>
            String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
          );
          return applyPublicOpenFilters(merged);
        });
        // If host username isn't cached, fetch once in background.
        const hostId = String(row.white_player_id ?? '').trim();
        if (hostId && !profileNameCacheRef.current.has(hostId)) {
          void supabase
            .from('profiles')
            .select('id,username')
            .eq('id', hostId)
            .maybeSingle()
            .then(({ data }) => {
              if (!data?.id) return;
              profileNameCacheRef.current.set(data.id as string, (data.username as string | null) ?? null);
              setRaw((prev) =>
                prev.map((r) => (r.white_player_id === data.id ? { ...r, hostUsername: (data.username as string | null) ?? null } : r)),
              );
            });
        }
      }
      // Safety fallback: partial updates can drift; refresh occasionally only.
      if (Date.now() - lastFullSyncAtRef.current > 60_000) {
        requestNotifyResync();
      }
    });
    return () => {
      unsub();
    };
  }, [lobbyRt, requestNotifyResync]);

  const rows = useMemo(() => {
    return raw.filter((r) => {
      if (!openSeatMatchesPlatMode(r, mode)) return false;
      if (!openSeatMatchesPlatClock(r, mode, selectedClock)) return false;
      return openSeatMatchesRated(r, selectedRated);
    });
  }, [raw, mode, selectedClock, selectedRated]);

  return { rows, loading, error };
}
