'use client';

import { useEffect, useState } from 'react';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';
import { supabase } from '@/lib/supabaseClient';

const empty: Record<PlatMode, boolean> = {
  bullet: false,
  blitz: false,
  rapid: false,
  daily: false,
};

/** Whether a public free-play open seat exists in each PLAT bucket. */
export function useFreeOpenSeatActivity(): {
  activity: Record<PlatMode, boolean>;
  loading: boolean;
} {
  const [activity, setActivity] = useState<Record<PlatMode, boolean>>(empty);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('games')
        .select('tempo,live_time_control')
        .eq('play_context', 'free')
        .is('tournament_id', null)
        .eq('status', 'active')
        .is('black_player_id', null);
      if (cancelled) return;
      const next = { ...empty };
      if (!error && data?.length) {
        for (const row of data as { tempo: string | null; live_time_control: string | null }[]) {
          const m = platBucketForOpenSeat(row.tempo, row.live_time_control);
          if (m) next[m] = true;
        }
      }
      setActivity(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { activity, loading };
}
