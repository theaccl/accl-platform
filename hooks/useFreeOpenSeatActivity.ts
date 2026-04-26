'use client';

import { useCallback, useContext, useEffect, useState } from 'react';

import { FreePlayLobbyGamesRealtimeContext } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
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
  const lobbyRt = useContext(FreePlayLobbyGamesRealtimeContext);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('games')
      .select('tempo,live_time_control')
      .eq('play_context', 'free')
      .is('tournament_id', null)
      .eq('status', 'active')
      .is('black_player_id', null);
    const next = { ...empty };
    if (!error && data?.length) {
      for (const row of data as { tempo: string | null; live_time_control: string | null }[]) {
        const m = platBucketForOpenSeat(row.tempo, row.live_time_control);
        if (m) next[m] = true;
      }
    }
    setActivity(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!lobbyRt) return;
    return lobbyRt.subscribe(() => {
      void refetch();
    });
  }, [lobbyRt, refetch]);

  return { activity, loading };
}
