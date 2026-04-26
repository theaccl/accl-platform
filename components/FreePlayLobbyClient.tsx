'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { FreePlayLobbyGamesRealtimeProvider } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import { acclPerfTime } from '@/lib/acclPerfDebug';
import { supabase } from '@/lib/supabaseClient';

/**
 * Free lobby shell: stable test ids for E2E (`free-lobby-root`, `free-lobby-ready`).
 * One shared `games` Realtime filter (`play_context=eq.free`) + debounced fan-out (see FreePlayLobbyGamesRealtimeProvider).
 */
export function FreePlayLobbyClient({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = acclPerfTime('free-lobby.getSession');
    void supabase.auth.getSession().then(() => {
      t.end();
      setReady(true);
    });
  }, []);

  return (
    <div data-testid="free-lobby-root" className="relative flex-1 w-full min-h-0">
      {ready ? (
        <span className="sr-only" data-testid="free-lobby-ready">
          Lobby session ready
        </span>
      ) : null}
      <FreePlayLobbyGamesRealtimeProvider>{children}</FreePlayLobbyGamesRealtimeProvider>
    </div>
  );
}
