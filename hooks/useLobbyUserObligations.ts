'use client';

import { useEffect, useMemo, useState } from 'react';

import { partitionGamesByContinuity } from '@/lib/gameContinuityPresentation';
import { countYourMoveByPlatMode } from '@/lib/lobbyModeFilter';
import type { LobbyObligationRow } from '@/lib/lobbyObligationPresentation';
import { supabase } from '@/lib/supabaseClient';

const GAME_SELECT =
  'id,status,tempo,live_time_control,rated,turn,white_player_id,black_player_id,updated_at,tournament_id,white_clock_ms,black_clock_ms';

export function useLobbyUserObligations() {
  const [freeRows, setFreeRows] = useState<LobbyObligationRow[] | null>(null);
  const [tournamentRows, setTournamentRows] = useState<LobbyObligationRow[] | null>(null);
  const [tournamentNames, setTournamentNames] = useState<Record<string, string>>({});
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: s } = await supabase.auth.getSession();
      const me = s.session?.user?.id ?? null;
      if (cancelled) return;
      setUid(me);
      if (!me) {
        setFreeRows([]);
        setTournamentRows([]);
        return;
      }

      const [freeRes, tRes] = await Promise.all([
        supabase
          .from('games')
          .select(GAME_SELECT)
          .eq('play_context', 'free')
          .is('tournament_id', null)
          .in('status', ['active', 'waiting'])
          .or(`white_player_id.eq.${me},black_player_id.eq.${me}`)
          .order('updated_at', { ascending: false })
          .limit(24),
        supabase
          .from('games')
          .select(GAME_SELECT)
          .eq('play_context', 'tournament')
          .not('tournament_id', 'is', null)
          .in('status', ['active', 'waiting'])
          .or(`white_player_id.eq.${me},black_player_id.eq.${me}`)
          .order('updated_at', { ascending: false })
          .limit(12),
      ]);

      if (cancelled) return;
      if (freeRes.error || tRes.error) {
        setError('Could not load your games.');
        setFreeRows([]);
        setTournamentRows([]);
        return;
      }

      const free = (freeRes.data ?? []) as LobbyObligationRow[];
      const tournament = (tRes.data ?? []) as LobbyObligationRow[];
      setFreeRows(free);
      setTournamentRows(tournament);

      const tids = [...new Set(tournament.map((r) => String(r.tournament_id ?? '').trim()).filter(Boolean))];
      if (tids.length === 0) {
        setTournamentNames({});
        return;
      }
      const { data: tMeta } = await supabase.from('tournaments').select('id,name').in('id', tids);
      if (cancelled) return;
      const names: Record<string, string> = {};
      for (const row of tMeta ?? []) {
        const id = String((row as { id: string }).id ?? '').trim();
        const name = String((row as { name: string }).name ?? '').trim();
        if (id) names[id] = name || 'Tournament';
      }
      setTournamentNames(names);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { live: freeLiveRaw, dailyAsync: dailyAsyncRaw } = useMemo(
    () => partitionGamesByContinuity(freeRows ?? []),
    [freeRows],
  );

  const yourMoveByMode = useMemo(
    () => countYourMoveByPlatMode([...(freeRows ?? []), ...(tournamentRows ?? [])], uid),
    [freeRows, tournamentRows, uid],
  );

  const loading = freeRows === null || tournamentRows === null;

  return {
    uid,
    error,
    loading,
    freeRows,
    freeLiveRaw,
    dailyAsyncRaw,
    tournamentRows,
    tournamentNames,
    yourMoveByMode,
  };
}
