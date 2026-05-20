'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { GameContinuityGameRows } from '@/components/free/GameContinuityGameRows';
import {
  DAILY_ASYNC_SECTION_HINT,
  freeActiveGamesHref,
  LIVE_NOW_SECTION_HINT,
  partitionGamesByContinuity,
} from '@/lib/gameContinuityPresentation';
import {
  DAILY_ASYNC_YOUR_MOVE_TITLE,
  FREE_LIVE_SECTION_TITLE,
  sortLobbyObligationRows,
  TOURNAMENT_LIVE_SECTION_HINT,
  TOURNAMENT_LIVE_SECTION_TITLE,
  YOUR_MOVE_SECTION_TITLE,
  type LobbyObligationRow,
} from '@/lib/lobbyObligationPresentation';
import { supabase } from '@/lib/supabaseClient';

function ObligationSubsection({
  title,
  hint,
  viewAllHref,
  testId,
  titleClassName,
  borderClassName,
  children,
}: {
  title: string;
  hint: string;
  viewAllHref?: string;
  testId: string;
  titleClassName: string;
  borderClassName: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 sm:px-5 ${borderClassName}`} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${titleClassName}`}>{title}</h3>
        {viewAllHref ? (
          <Link href={viewAllHref} className="text-[11px] font-semibold text-sky-300 underline-offset-2 hover:underline">
            View all
          </Link>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-gray-500">{hint}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * Lobby hub: obligations first — tournament live, free live, then daily/async (separate).
 */
export function FreeLobbyCurrentGamesPanel() {
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

      const gameSelect =
        'id,status,tempo,live_time_control,turn,white_player_id,black_player_id,updated_at,tournament_id,white_clock_ms,black_clock_ms';

      const [freeRes, tRes] = await Promise.all([
        supabase
          .from('games')
          .select(gameSelect)
          .eq('play_context', 'free')
          .is('tournament_id', null)
          .in('status', ['active', 'waiting'])
          .or(`white_player_id.eq.${me},black_player_id.eq.${me}`)
          .order('updated_at', { ascending: false })
          .limit(24),
        supabase
          .from('games')
          .select(gameSelect)
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

  const tournamentLive = useMemo(
    () => sortLobbyObligationRows(tournamentRows ?? [], uid),
    [tournamentRows, uid],
  );
  const freeLive = useMemo(() => sortLobbyObligationRows(freeLiveRaw, uid), [freeLiveRaw, uid]);
  const dailyAsync = useMemo(() => sortLobbyObligationRows(dailyAsyncRaw, uid), [dailyAsyncRaw, uid]);

  const loading = freeRows === null || tournamentRows === null;

  return (
    <section
      className="relative z-20 mb-4 space-y-3"
      data-testid="free-lobby-current-games"
      aria-label="Your move and active games"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-sm font-bold uppercase tracking-[0.18em] text-amber-200/95"
          data-testid="free-lobby-your-move-heading"
        >
          {YOUR_MOVE_SECTION_TITLE}
        </h2>
        <Link
          href={freeActiveGamesHref()}
          className="text-[11px] font-semibold text-sky-300 underline-offset-2 hover:underline"
        >
          All your games
        </Link>
      </div>

      {loading ? (
        <p className="rounded-xl border border-amber-500/25 bg-[#14100c] px-4 py-3 text-xs text-gray-500">
          Loading your boards…
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-500/35 bg-[#0f141c] px-4 py-3 text-xs text-red-400">{error}</p>
      ) : null}

      <ObligationSubsection
        title={TOURNAMENT_LIVE_SECTION_TITLE}
        hint={TOURNAMENT_LIVE_SECTION_HINT}
        testId="free-lobby-tournament-live"
        titleClassName="text-amber-200/90"
        borderClassName="border-amber-500/35 bg-[#14100c]"
      >
        {!loading && tournamentLive.length === 0 ? (
          <p className="text-xs text-gray-500">No active tournament boards.</p>
        ) : null}
        {tournamentLive.length > 0 ? (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tournamentLive.map((g) => {
              const tid = String(g.tournament_id ?? '').trim();
              const label = tid ? (tournamentNames[tid] ?? 'Tournament') : 'Tournament';
              return (
                <li key={g.id}>
                  <Link
                    href={`/game/${g.id}`}
                    className="flex min-h-[48px] flex-col justify-center rounded-lg border border-amber-500/30 bg-[#1a140c] px-3 py-2 text-sm text-gray-200 transition hover:border-amber-400/50 hover:bg-[#221a0e]"
                    data-testid={`free-lobby-tournament-game-${g.id}`}
                  >
                    <span className="truncate font-semibold text-amber-50">{label}</span>
                    <span className="text-[11px] text-amber-200/70">Bracket board — open game</span>
                  </Link>
                  {tid ? (
                    <Link
                      href={`/tournaments/${tid}`}
                      className="mt-1 inline-block text-[10px] font-medium text-gray-500 hover:text-amber-200/80"
                      data-testid={`free-lobby-tournament-detail-${tid}`}
                    >
                      Tournament hub →
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </ObligationSubsection>

      <ObligationSubsection
        title={FREE_LIVE_SECTION_TITLE}
        hint={LIVE_NOW_SECTION_HINT}
        viewAllHref={freeActiveGamesHref('live')}
        testId="free-lobby-live-now"
        titleClassName="text-sky-300/90"
        borderClassName="border-sky-500/35 bg-[#0f141c]"
      >
        {!loading && freeLive.length === 0 ? (
          <p className="text-xs text-gray-500">No free-play live boards right now.</p>
        ) : null}
        {freeLive.length > 0 ? (
          <GameContinuityGameRows rows={freeLive} uid={uid} variant="live" testIdPrefix="free-lobby-live" compact />
        ) : null}
      </ObligationSubsection>

      <ObligationSubsection
        title={DAILY_ASYNC_YOUR_MOVE_TITLE}
        hint={DAILY_ASYNC_SECTION_HINT}
        viewAllHref={freeActiveGamesHref('async')}
        testId="free-lobby-daily-async"
        titleClassName="text-violet-300/90"
        borderClassName="border-violet-500/30 bg-[#0f141c]"
      >
        {!loading && dailyAsync.length === 0 ? (
          <p className="text-xs text-gray-500">No daily or correspondence games waiting.</p>
        ) : null}
        {dailyAsync.length > 0 ? (
          <GameContinuityGameRows
            rows={dailyAsync}
            uid={uid}
            variant="async"
            testIdPrefix="free-lobby-async"
            compact
          />
        ) : null}
      </ObligationSubsection>
    </section>
  );
}
