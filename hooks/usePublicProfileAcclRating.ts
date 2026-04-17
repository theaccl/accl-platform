'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { acclRatingFromP1, formatRatingDisplay, parseP1FromSnapshotPayload } from '@/lib/p1PublicRatingRead';
import { supabase } from '@/lib/supabaseClient';

/**
 * P1 `accl_rating` for identity preview; falls back to `profiles.rating`, then `metadataFallback` while loading.
 */
export function usePublicProfileAcclRating(
  sessionUser: User | null,
  metadataFallback: string,
): string {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    const uid = sessionUser?.id?.trim();
    if (!uid) {
      setValue(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [{ data: prof }, { data, error }] = await Promise.all([
        supabase.from('profiles').select('rating').eq('id', uid).maybeSingle(),
        supabase.rpc('get_public_profile_snapshot', {
          p_profile_id: uid,
        }),
      ]);
      if (cancelled) return;
      const legacy =
        typeof prof?.rating === 'number' && Number.isFinite(prof.rating) ? prof.rating : null;
      if (error) {
        setValue(legacy != null ? formatRatingDisplay(legacy) : null);
        return;
      }
      const p1 = parseP1FromSnapshotPayload(data);
      const n = acclRatingFromP1(p1, legacy);
      setValue(n != null ? formatRatingDisplay(n) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id]);

  return value ?? metadataFallback;
}
