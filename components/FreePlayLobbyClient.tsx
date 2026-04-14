'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

/**
 * Free lobby shell: stable test ids for E2E (`free-lobby-root`, `free-lobby-ready`).
 */
export function FreePlayLobbyClient({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(() => setReady(true));
  }, []);

  return (
    <div data-testid="free-lobby-root" className="flex-1 w-full min-h-0">
      {ready ? (
        <span
          data-testid="free-lobby-ready"
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
          aria-hidden
        />
      ) : null}
      {children}
    </div>
  );
}
