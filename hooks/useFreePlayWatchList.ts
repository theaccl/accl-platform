'use client';

import { useEffect, useState } from 'react';

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/free-play/watch-list', {
        headers: { 'x-accl-viewer-ecosystem': viewerEcosystem },
      });
      if (cancelled) return;
      if (!res.ok) {
        setData(null);
        setError('Could not load watch list.');
        setLoading(false);
        return;
      }
      const j = (await res.json()) as Payload;
      setData(j);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerEcosystem]);

  return { data, loading, error };
}
