'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Loads `profiles.username` for the signed-in user so public identity can prefer DB over JWT metadata.
 */
export function useProfileUsername(sessionUser: User | null): string | null {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const id = sessionUser?.id;
    if (!id) {
      setUsername(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('profiles')
      .select('username')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const u = (data as { username?: string | null } | null)?.username;
        setUsername(typeof u === 'string' && u.trim() ? u.trim() : null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id]);

  return username;
}
