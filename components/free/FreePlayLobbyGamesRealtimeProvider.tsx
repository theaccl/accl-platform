'use client';

import { createContext, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { supabase } from '@/lib/supabaseClient';

export type FreeLobbyGamesRtDebug = {
  providerMounted: boolean;
  channelStatus: string;
  eventsReceived: number;
  refetchFlushes: number;
  /** scheduleResync: poll, visibility, focus, pageshow, channel status, explicit mount requests. */
  scheduleResyncCount: number;
  lastEventAt: number | null;
  lastFlushAt: number | null;
  lastResyncRequestAt: number | null;
  lastPollTickAt: number | null;
  isPageVisible: boolean;
  listenerCount: number;
  clear: () => void;
};

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

/**
 * One channel, one debounced fan-out. Hooks use context `subscribe` only.
 * `postgres_changes` is scoped to INSERT/DELETE for free games. Polling + visibility + channel recovery reconcile updates.
 */
/** Debounce before fan-out so Postgres/PostgREST visibility can settle after NOTIFY. */
const NOTIFY_DEBOUNCE_MS = 700;
const LOBBY_SYNC_POLL_MS_VISIBLE = 12_000;
/** Skip a poll-driven resync if any flush just ran (avoids back-to-back poll + realtime refetch). */
const POLL_SUPPRESS_MS_AFTER_FLUSH = 1_200;
/** Hard floor between flushes so bursty channels cannot create refetch storms across consumers. */
const MIN_FLUSH_GAP_MS = 1_000;

type LobbyGamesRealtimeApi = {
  subscribe: (listener: (event: FreeLobbyGamesRtEvent) => void) => () => void;
  requestResync: () => void;
};

export const FreePlayLobbyGamesRealtimeContext = createContext<LobbyGamesRealtimeApi | null>(null);

export type FreeLobbyGameRtRow = {
  id: string;
  white_player_id?: string | null;
  black_player_id?: string | null;
  tempo?: string | null;
  live_time_control?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  rated?: boolean | null;
  status?: string | null;
  play_context?: string | null;
  tournament_id?: string | null;
};

export type FreeLobbyGamesRtEvent =
  | { kind: 'snapshot' }
  | { kind: 'game_insert'; row: FreeLobbyGameRtRow }
  | { kind: 'game_delete'; row: FreeLobbyGameRtRow };

type DebugState = {
  channelStatus: string;
  eventsReceived: number;
  flushesRun: number;
  resyncRequestCount: number;
  lastEventAt: number | null;
  lastFlushAt: number | null;
  lastResyncRequestAt: number | null;
  lastPollTickAt: number | null;
  pageVisible: boolean;
};

export function FreePlayLobbyGamesRealtimeProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<(event: FreeLobbyGamesRtEvent) => void>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFlushWallMsRef = useRef(0);
  const debugStateRef = useRef<DebugState>({
    channelStatus: 'idle',
    eventsReceived: 0,
    flushesRun: 0,
    resyncRequestCount: 0,
    lastEventAt: null,
    lastFlushAt: null,
    lastResyncRequestAt: null,
    lastPollTickAt: null,
    pageVisible: true,
  });

  const syncWindowDebug = useCallback(() => {
    if (typeof window === 'undefined' || !lobbyGamesRtDebugEnabled()) return;
    const s = debugStateRef.current;
    const w = window as unknown as { __accl_freeLobbyGamesRt: FreeLobbyGamesRtDebug | undefined };
    w.__accl_freeLobbyGamesRt = {
      providerMounted: true,
      channelStatus: s.channelStatus,
      eventsReceived: s.eventsReceived,
      refetchFlushes: s.flushesRun,
      scheduleResyncCount: s.resyncRequestCount,
      lastEventAt: s.lastEventAt,
      lastFlushAt: s.lastFlushAt,
      lastResyncRequestAt: s.lastResyncRequestAt,
      lastPollTickAt: s.lastPollTickAt,
      isPageVisible: s.pageVisible,
      listenerCount: listenersRef.current.size,
      clear: () => {
        s.eventsReceived = 0;
        s.flushesRun = 0;
        s.resyncRequestCount = 0;
        s.lastEventAt = null;
        s.lastFlushAt = null;
        s.lastResyncRequestAt = null;
        s.lastPollTickAt = null;
        w.__accl_freeLobbyGamesRt = undefined;
      },
    };
  }, []);

  const flush = useCallback(() => {
    debounceRef.current = null;
    const sinceLast = Date.now() - lastFlushWallMsRef.current;
    if (sinceLast < MIN_FLUSH_GAP_MS) {
      debounceRef.current = setTimeout(flush, MIN_FLUSH_GAP_MS - sinceLast);
      return;
    }
    lastFlushWallMsRef.current = Date.now();
    if (lobbyGamesRtDebugEnabled() && typeof window !== 'undefined') {
      const s = debugStateRef.current;
      s.flushesRun += 1;
      s.lastFlushAt = Date.now();
      if (process.env.NODE_ENV === 'development') {
        console.debug('[free-lobby-games-rt] flush', {
          listeners: listenersRef.current.size,
          flushesRun: s.flushesRun,
        });
      }
    }
    for (const fn of listenersRef.current) {
      try {
        fn({ kind: 'snapshot' });
      } catch {
        /* ignore */
      }
    }
    if (lobbyGamesRtDebugEnabled() && typeof window !== 'undefined') {
      void syncWindowDebug();
    }
  }, [syncWindowDebug]);

  const scheduleFlush = useCallback(() => {
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(flush, NOTIFY_DEBOUNCE_MS);
  }, [flush]);

  const scheduleResync = useCallback(
    (kind: 'poll' | 'visible' | 'mount') => {
      const s = debugStateRef.current;
      if (kind === 'poll') {
        const since = Date.now() - lastFlushWallMsRef.current;
        if (since < POLL_SUPPRESS_MS_AFTER_FLUSH) {
          if (lobbyGamesRtDebugEnabled() && process.env.NODE_ENV === 'development') {
            console.debug('[free-lobby-games-rt] scheduleResync poll skipped (recent flush)', { sinceMs: since });
          }
          return;
        }
      }
      s.resyncRequestCount += 1;
      s.lastResyncRequestAt = Date.now();
      if (kind === 'poll') {
        s.lastPollTickAt = Date.now();
      }
      s.pageVisible = document.visibilityState === 'visible';
      if (lobbyGamesRtDebugEnabled() && process.env.NODE_ENV === 'development') {
        console.debug('[free-lobby-games-rt] scheduleResync', kind);
      }
      if (lobbyGamesRtDebugEnabled() && typeof window !== 'undefined') {
        void syncWindowDebug();
      }
      scheduleFlush();
    },
    [scheduleFlush, syncWindowDebug]
  );

  const subscribe = useCallback((listener: (event: FreeLobbyGamesRtEvent) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const requestResync = useCallback(() => {
    scheduleResync('mount');
  }, [scheduleResync]);

  useEffect(() => {
    debugStateRef.current.channelStatus = 'connecting';
    void syncWindowDebug();

    const emitEvent = (event: FreeLobbyGamesRtEvent) => {
      for (const fn of listenersRef.current) {
        try {
          fn(event);
        } catch {
          /* ignore */
        }
      }
    };

    const ch = supabase
      .channel('free-lobby-games-rt-shared')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'games',
          filter: 'play_context=eq.free',
        },
        (payload) => {
          const row = (payload.new ?? null) as FreeLobbyGameRtRow | null;
          if (lobbyGamesRtDebugEnabled() && typeof window !== 'undefined') {
            const s = debugStateRef.current;
            s.eventsReceived += 1;
            s.lastEventAt = Date.now();
            void syncWindowDebug();
          }
          if (row) {
            emitEvent({ kind: 'game_insert', row });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'games',
          filter: 'play_context=eq.free',
        },
        (payload) => {
          const row = (payload.old ?? null) as FreeLobbyGameRtRow | null;
          if (lobbyGamesRtDebugEnabled() && typeof window !== 'undefined') {
            const s = debugStateRef.current;
            s.eventsReceived += 1;
            s.lastEventAt = Date.now();
            void syncWindowDebug();
          }
          if (row) {
            emitEvent({ kind: 'game_delete', row });
          }
        }
      )
      .subscribe((status) => {
        debugStateRef.current.channelStatus = status;
        void syncWindowDebug();
        if (lobbyGamesRtDebugEnabled() && process.env.NODE_ENV === 'development') {
          console.debug('[free-lobby-games-rt] channel', status, {
            listeners: listenersRef.current.size,
          });
        }
      });
    return () => {
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      debugStateRef.current.channelStatus = 'closed';
      if (lobbyGamesRtDebugEnabled() && typeof window !== 'undefined') {
        (window as unknown as { __accl_freeLobbyGamesRt?: FreeLobbyGamesRtDebug }).__accl_freeLobbyGamesRt = undefined;
      }
      void supabase.removeChannel(ch);
    };
  }, [scheduleFlush, scheduleResync, syncWindowDebug]);

  useEffect(() => {
    const s = debugStateRef.current;

    const setPoll = () => {
      if (pollRef.current != null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      s.pageVisible = document.visibilityState === 'visible';
      if (s.pageVisible) {
        pollRef.current = setInterval(() => {
          scheduleResync('poll');
        }, LOBBY_SYNC_POLL_MS_VISIBLE);
      }
      if (lobbyGamesRtDebugEnabled()) void syncWindowDebug();
    };

    const onVisibility = () => {
      setPoll();
      if (document.visibilityState === 'visible') {
        scheduleResync('visible');
      }
    };

    setPoll();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (pollRef.current != null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [scheduleResync, syncWindowDebug]);

  useEffect(() => {
    if (lobbyGamesRtDebugEnabled() && process.env.NODE_ENV === 'development') {
      console.debug('[free-lobby-games-rt] provider mounted');
    }
  }, []);

  const value = useMemo(() => ({ subscribe, requestResync }), [requestResync, subscribe]);

  return (
    <FreePlayLobbyGamesRealtimeContext.Provider value={value}>{children}</FreePlayLobbyGamesRealtimeContext.Provider>
  );
}
