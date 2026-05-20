'use client';

import { useCallback, useEffect, useState } from 'react';

import { emptyPlatModeCounts } from '@/lib/lobbyModeFilter';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';
import { supabase } from '@/lib/supabaseClient';

/** Active tournament boards with both seats (lobby density signal per PLAT bucket). */
export function useLobbyTournamentLiveByMode(): {
  counts: Record<PlatMode, number>;
  loading: boolean;
} {
  const [counts, setCounts] = useState(emptyPlatModeCounts);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('games')
      .select('tempo,live_time_control')
      .eq('play_context', 'tournament')
      .not('tournament_id', 'is', null)
      .in('status', ['active', 'waiting'])
      .not('white_player_id', 'is', null)
      .not('black_player_id', 'is', null);

    const next = emptyPlatModeCounts();
    if (!error && data?.length) {
      for (const row of data as { tempo: string | null; live_time_control: string | null }[]) {
        const m = platBucketForOpenSeat(row.tempo, row.live_time_control);
        if (m) next[m] += 1;
      }
    }
    setCounts(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { counts, loading };
}
