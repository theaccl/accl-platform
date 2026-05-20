'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { GameContinuityGameRows } from '@/components/free/GameContinuityGameRows';
import type { useLobbyUserObligations } from '@/hooks/useLobbyUserObligations';
import {
  DAILY_ASYNC_SECTION_HINT,
  freeActiveGamesHref,
  LIVE_NOW_SECTION_HINT,
} from '@/lib/gameContinuityPresentation';
import {
  DAILY_ASYNC_YOUR_MOVE_TITLE,
  FREE_LIVE_SECTION_TITLE,
  sortLobbyObligationRows,
  TOURNAMENT_LIVE_SECTION_HINT,
  TOURNAMENT_LIVE_SECTION_TITLE,
  YOUR_MOVE_SECTION_TITLE,
} from '@/lib/lobbyObligationPresentation';
import { filterRowsByLobbyMode, type LobbyHubModeFilter } from '@/lib/lobbyModeFilter';
import { PLAT_MODE_LABELS } from '@/lib/freePlayModeTimeControl';

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

export type LobbyObligationsSnapshot = ReturnType<typeof useLobbyUserObligations>;

type Props = {
  modeFilter?: LobbyHubModeFilter;
  obligations: LobbyObligationsSnapshot;
};

/**
 * Lobby hub: obligations first — tournament live (always), free live + daily/async respect mode filter.
 */
export function FreeLobbyCurrentGamesPanel({ modeFilter = null, obligations }: Props) {
  const { uid, error, loading, freeLiveRaw, dailyAsyncRaw, tournamentRows, tournamentNames } = obligations;
  const filterLabel = modeFilter ? PLAT_MODE_LABELS[modeFilter] : null;

  const tournamentLive = useMemo(
    () => sortLobbyObligationRows(tournamentRows ?? [], uid),
    [tournamentRows, uid],
  );
  const freeLive = useMemo(
    () => sortLobbyObligationRows(filterRowsByLobbyMode(freeLiveRaw, modeFilter), uid),
    [freeLiveRaw, modeFilter, uid],
  );
  const dailyAsync = useMemo(
    () => sortLobbyObligationRows(filterRowsByLobbyMode(dailyAsyncRaw, modeFilter), uid),
    [dailyAsyncRaw, modeFilter, uid],
  );

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
        hint={
          filterLabel
            ? `${LIVE_NOW_SECTION_HINT} Filtered to ${filterLabel} — clear mode filter to see all live boards.`
            : LIVE_NOW_SECTION_HINT
        }
        viewAllHref={freeActiveGamesHref('live')}
        testId="free-lobby-live-now"
        titleClassName="text-sky-300/90"
        borderClassName="border-sky-500/35 bg-[#0f141c]"
      >
        {!loading && freeLive.length === 0 ? (
          <p className="text-xs text-gray-500">
            {modeFilter ? 'No free-play live boards in this mode.' : 'No free-play live boards right now.'}
          </p>
        ) : null}
        {freeLive.length > 0 ? (
          <GameContinuityGameRows rows={freeLive} uid={uid} variant="live" testIdPrefix="free-lobby-live" compact />
        ) : null}
      </ObligationSubsection>

      <ObligationSubsection
        title={DAILY_ASYNC_YOUR_MOVE_TITLE}
        hint={
          filterLabel
            ? `${DAILY_ASYNC_SECTION_HINT} Filtered to ${filterLabel}.`
            : DAILY_ASYNC_SECTION_HINT
        }
        viewAllHref={freeActiveGamesHref('async')}
        testId="free-lobby-daily-async"
        titleClassName="text-violet-300/90"
        borderClassName="border-violet-500/30 bg-[#0f141c]"
      >
        {!loading && dailyAsync.length === 0 ? (
          <p className="text-xs text-gray-500">
            {modeFilter ? 'No daily/async games in this mode.' : 'No daily or correspondence games waiting.'}
          </p>
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
