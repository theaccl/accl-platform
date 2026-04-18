'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type ProfileUsernameState = {
  username: string | null;
  /** True after the first profiles lookup for this user (or immediately when signed out). */
  ready: boolean;
};

/**
 * Loads `profiles.username` for the signed-in user so public identity can prefer DB over JWT metadata.
 */
export function useProfileUsername(sessionUser: User | null): ProfileUsernameState {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = sessionUser?.id;
    if (!id) {
      queueMicrotask(() => {
        setUsername(null);
        setReady(true);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setReady(false));
    void supabase
      .from('profiles')
      .select('username')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setUsername(null);
          setReady(true);
          return;
        }
        const u = (data as { username?: string | null } | null)?.username;
        setUsername(typeof u === 'string' && u.trim() ? u.trim() : null);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id]);

  return { username, ready };
}
