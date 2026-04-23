'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { acclPerfTime } from '@/lib/acclPerfDebug';
import { supabase } from '@/lib/supabaseClient';

/**
 * Free lobby shell: stable test ids for E2E (`free-lobby-root`, `free-lobby-ready`).
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
      {children}
    </div>
  );
}
