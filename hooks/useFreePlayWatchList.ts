'use client';

import { useCallback, useContext, useEffect, useState } from 'react';

import { FreePlayLobbyGamesRealtimeContext } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';
const emptyActivity: Record<PlatMode, boolean> = {
  bullet: false,
  blitz: false,
  rapid: false,
  daily: false,
};

type Payload = {
  byMode: Record<PlatMode, FreePlayWatchListRow[]>;
  watchActivity: Record<PlatMode, boolean>;
};

export function useFreePlayWatchList(viewerEcosystem: 'adult' | 'k12' = 'adult'): {
  data: Payload | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lobbyRt = useContext(FreePlayLobbyGamesRealtimeContext);

  const fetchPayload = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/free-play/watch-list', {
        headers: { 'x-accl-viewer-ecosystem': viewerEcosystem },
      });
      if (!res.ok) {
        setData(null);
        setError('Could not load watch list.');
        return;
      }
      const j = (await res.json()) as Payload;
      setData(j);
    } catch {
      setData(null);
      setError('Could not load watch list.');
    } finally {
      setLoading(false);
    }
  }, [viewerEcosystem]);

  useEffect(() => {
    setLoading(true);
    void fetchPayload();
  }, [fetchPayload]);

  useEffect(() => {
    if (!lobbyRt) return;
    return lobbyRt.subscribe(() => {
      void fetchPayload();
    });
  }, [lobbyRt, fetchPayload]);

  return { data, loading, error };
}
