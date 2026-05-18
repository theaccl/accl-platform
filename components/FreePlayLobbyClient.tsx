'use client';

import type { ReactNode } from 'react';

import { FreePlayLobbyGamesRealtimeProvider } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';

/**
 * Free lobby shell: stable test ids for E2E (`free-lobby-root`, `free-lobby-ready`).
 * One shared `games` Realtime filter (`play_context=eq.free`) + debounced fan-out (see FreePlayLobbyGamesRealtimeProvider).
 */
export function FreePlayLobbyClient({ children }: { children: ReactNode }) {
  return (
    <div data-testid="free-lobby-root" className="relative flex-1 w-full min-h-0">
      <span className="sr-only" data-testid="free-lobby-ready">
        Lobby shell mounted
      </span>
      <FreePlayLobbyGamesRealtimeProvider>{children}</FreePlayLobbyGamesRealtimeProvider>
    </div>
  );
}
