'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  openSeatMatchesPlatClock,
  openSeatMatchesPlatMode,
  openSeatMatchesRated,
  type FreeOpenSeatRow,
} from '@/lib/freePlayOpenSeatsFilter';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import { filterOpenSeatRowsExcludingBusyHosts } from '@/lib/freePlayFindMatch';
import { supabase } from '@/lib/supabaseClient';

/** Refresh open-seat snapshot while user stays in a mode room (no realtime yet). */
const OPEN_SEATS_POLL_MS = 15_000;

export type FreeLobbyOpenSeatRow = FreeOpenSeatRow & {
  /** Host display name when profiles load. */
  hostUsername: string | null;
};

/**
 * Public free-play open seats for a mode, filtered to selected time control and rated/unrated (queue view).
 */
export function useFreeLobbyOpenSeats(
  mode: PlatMode,
  selectedClock: string,
  selectedRated: boolean,
): {
  rows: FreeLobbyOpenSeatRow[];
  loading: boolean;
  error: string | null;
} {
  const [raw, setRaw] = useState<FreeLobbyOpenSeatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async (isInitial: boolean) => {
      if (isInitial) setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from('games')
        .select('id,white_player_id,tempo,live_time_control,created_at,rated')
        .eq('play_context', 'free')
        .is('tournament_id', null)
        .eq('status', 'active')
        .is('black_player_id', null)
        .order('created_at', { ascending: true })
        .limit(80);

      if (cancelled) return;

      if (qErr) {
        setError(qErr.message);
        setRaw([]);
        if (isInitial) setLoading(false);
        return;
      }

      const base = (data ?? []) as FreeOpenSeatRow[];

      const { rows: afterBusy, error: busyErr } = await filterOpenSeatRowsExcludingBusyHosts(supabase, base);
      if (cancelled) return;
      if (busyErr) {
        setError(busyErr);
        setRaw([]);
        if (isInitial) setLoading(false);
        return;
      }

      const ids = [...new Set(afterBusy.map((r) => r.white_player_id).filter(Boolean))];
      let nameById = new Map<string, string | null>();
      if (ids.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id,username')
          .in('id', ids);
        if (!pErr && profs) {
          nameById = new Map(profs.map((p) => [p.id as string, (p.username as string | null) ?? null]));
        }
      }

      if (cancelled) return;

      setRaw(
        afterBusy.map((r) => ({
          ...r,
          hostUsername: nameById.get(r.white_player_id) ?? null,
        })),
      );
      if (isInitial) {
        setLoading(false);
      }
    };

    void run(true);
    const id = setInterval(() => void run(false), OPEN_SEATS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(() => {
    return raw.filter((r) => {
      if (!openSeatMatchesPlatMode(r, mode)) return false;
      if (!openSeatMatchesPlatClock(r, mode, selectedClock)) return false;
      return openSeatMatchesRated(r, selectedRated);
    });
  }, [raw, mode, selectedClock, selectedRated]);

  return { rows, loading, error };
}
