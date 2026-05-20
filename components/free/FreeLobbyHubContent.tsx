'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { FreeLobbyCurrentGamesPanel } from '@/components/free/FreeLobbyCurrentGamesPanel';
import { FreeLobbyModeFilterStrip } from '@/components/free/FreeLobbyModeFilterStrip';
import { FreeLobbySpectatorFeed } from '@/components/free/FreeLobbySpectatorFeed';
import { LobbyChatPanel } from '@/components/free/LobbyChatPanel';
import { FreePlayOpenPairingByMode } from '@/components/free/FreePlayOpenPairingByMode';
import { nexusPrestigeRoot } from '@/components/nexus/nexusShellTheme';
import { useLobbyTournamentLiveByMode } from '@/hooks/useLobbyTournamentLiveByMode';
import { useLobbyUserObligations } from '@/hooks/useLobbyUserObligations';
import { useFreeOpenSeatActivity } from '@/hooks/useFreeOpenSeatActivity';
import { useFreePlayWatchList } from '@/hooks/useFreePlayWatchList';
import { isPlatMode, type LobbyHubModeFilter } from '@/lib/lobbyModeFilter';
import {
  PLAT_MODE_LABELS,
  PLAT_MODE_ORDER,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';
import { FREE_PLAY_LOBBY_GENERAL_ROOM } from '@/lib/lobbyChatRooms';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e12]';

/**
 * Free Play command center — obligations first, mode filters, then filterable live/open/spectate feeds.
 *
 * Follow-up: live tournament game pages — side panel with other active tournament boards, bracket state,
 * round label, and clickable game swaps.
 */
export function FreeLobbyHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode');
  const [modeFilter, setModeFilter] = useState<LobbyHubModeFilter>(() =>
    isPlatMode(initialMode) ? initialMode : null,
  );

  const { activity, counts: openSeatCounts, loading: openLoading } = useFreeOpenSeatActivity();
  const watchList = useFreePlayWatchList('adult');
  const tournamentLive = useLobbyTournamentLiveByMode();
  const obligations = useLobbyUserObligations();

  const liveByMode = useMemo(() => {
    const out = { bullet: 0, blitz: 0, rapid: 0, daily: 0 } as Record<PlatMode, number>;
    if (!watchList.data) return out;
    for (const m of PLAT_MODE_ORDER) {
      out[m] = watchList.data.byMode[m]?.length ?? 0;
    }
    return out;
  }, [watchList.data]);

  const onSelectMode = useCallback(
    (mode: LobbyHubModeFilter) => {
      setModeFilter(mode);
      const params = new URLSearchParams(searchParams.toString());
      if (mode) params.set('mode', mode);
      else params.delete('mode');
      const qs = params.toString();
      router.replace(qs ? `/free/lobby?${qs}` : '/free/lobby', { scroll: false });
    },
    [router, searchParams],
  );

  const stripLoading = openLoading || watchList.loading || tournamentLive.loading || obligations.loading;

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${nexusPrestigeRoot}`}>
      <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5 sm:px-5 sm:pt-6">
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl" data-testid="free-lobby-hub-title">
            Free Play Lobby
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
            Your move first — pick a mode zone below to filter live boards and open seats without leaving the hub. Use
            Room → only when you need mode-scoped chat or queue tools.
          </p>
        </header>

        <FreeLobbyCurrentGamesPanel modeFilter={modeFilter} obligations={obligations} />

        <FreeLobbyModeFilterStrip
          selected={modeFilter}
          onSelect={onSelectMode}
          loading={stripLoading}
          signals={{
            liveByMode,
            openByMode: openSeatCounts,
            tournamentByMode: tournamentLive.counts,
            yourMoveByMode: obligations.yourMoveByMode,
          }}
        />

        <FreeLobbySpectatorFeed
          loading={watchList.loading}
          error={watchList.error}
          byMode={watchList.data?.byMode ?? null}
          modeFilter={modeFilter}
        />

        <FreePlayOpenPairingByMode
          activity={activity}
          openSeatCounts={openSeatCounts}
          loading={openLoading}
          modeFilter={modeFilter}
        />

        <section className="mt-5" data-testid="free-lobby-hub-general-chat-section">
          <LobbyChatPanel
            lobbyRoom={FREE_PLAY_LOBBY_GENERAL_ROOM}
            roomLabel="General"
            heading="General lobby chat"
            compact
            data-testid="free-lobby-hub-general-chat"
          />
        </section>

        <details className="mt-5 rounded-xl border border-[#243244] bg-[#111a27] p-4 sm:p-5" data-testid="free-lobby-mode-rooms-collapsed">
          <summary className={`cursor-pointer text-sm font-semibold text-gray-300 ${focusRing}`}>
            Mode rooms (secondary depth)
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            Scoped chat, queue filters, and play-vs-computer. Filters above stay on this hub; open a room when you need
            mode-specific tooling.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PLAT_MODE_ORDER.map((m: PlatMode) => (
              <li key={m}>
                <Link
                  href={`/free/lobby/${m}`}
                  className={`flex min-h-[44px] items-center justify-center rounded-lg border border-red-900/45 bg-red-950/30 px-3 py-2 text-center text-sm font-semibold text-red-50 transition hover:border-red-500/40 hover:bg-red-950/50 ${focusRing}`}
                  data-testid={`free-lobby-hub-enter-${m}`}
                >
                  {PLAT_MODE_LABELS[m]}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
