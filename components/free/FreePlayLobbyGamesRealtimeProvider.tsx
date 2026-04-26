'use client';

import { createContext, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { supabase } from '@/lib/supabaseClient';

/** One debounced fan-out per free `games` change — avoids N duplicate Realtime joins + thundering refetch. */
const NOTIFY_DEBOUNCE_MS = 140;

type LobbyGamesRealtimeApi = {
  subscribe: (listener: () => void) => () => void;
};

export const FreePlayLobbyGamesRealtimeContext = createContext<LobbyGamesRealtimeApi | null>(null);

export function FreePlayLobbyGamesRealtimeProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<() => void>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    debounceRef.current = null;
    for (const fn of listenersRef.current) {
      try {
        fn();
      } catch {
        /* ignore listener errors */
      }
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(flush, NOTIFY_DEBOUNCE_MS);
  }, [flush]);

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel('free-lobby-games-rt-shared')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: 'play_context=eq.free',
        },
        () => {
          scheduleFlush();
        }
      )
      .subscribe();
    return () => {
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void supabase.removeChannel(ch);
    };
  }, [scheduleFlush]);

  const value = useMemo(() => ({ subscribe }), [subscribe]);

  return (
    <FreePlayLobbyGamesRealtimeContext.Provider value={value}>{children}</FreePlayLobbyGamesRealtimeContext.Provider>
  );
}
