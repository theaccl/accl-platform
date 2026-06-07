'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { FreeLobbyOpenGamesList } from '@/components/free/FreeLobbyOpenGamesList';
import { SelfLoadingLiveGameRecoveryBanner } from '@/components/free/LiveGameRecoveryBanner';
import { FreeLobbyPlayComputerPanel } from '@/components/free/FreeLobbyPlayComputerPanel';
import { FreePlayWatchSpectatorForMode } from '@/components/free/FreePlayWatchSpectatorForMode';
import { useFreeLobbyModeClockActivity } from '@/hooks/useFreeLobbyModeClockActivity';
import { platModeExposesComputerPlay } from '@/lib/freePlayComputerEntry';
import { LobbyChatPanel } from '@/components/free/LobbyChatPanel';
import { FreePlayMatchPanel } from '@/components/FreePlayMatchPanel';
import { nexusPrestigeRoot } from '@/components/nexus/nexusShellTheme';
import {
  coercePlatTimeForMode,
  defaultPlatTimeControl,
  isValidPlatTimeForMode,
  PLAT_MODE_LABELS,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';
import { FREE_PLAY_LOBBY_ROOM_BY_MODE, lobbyModeLabel } from '@/lib/lobbyChatRooms';
import { dailyRoomUsesDualDiscoverySections } from '@/lib/freeLobbyDailyDiscoveryLayout';

type Props = {
  mode: PlatMode;
};

const noopMode = (_m: PlatMode) => {
  void _m;
};

/**
 * Mode room hierarchy: Play Computer (live modes) → Open Games → Watch → Create/Find → chat.
 */
export function FreeLobbyModeRoomContent({ mode }: Props) {
  const [clock, setClock] = useState<string>(() => defaultPlatTimeControl(mode));
  const [rated, setRated] = useState(true);
  /** Daily Create/Find lane only — does not filter public discovery sections above. */
  const [postRated, setPostRated] = useState(true);
  const dualDailyDiscovery = dailyRoomUsesDualDiscoverySections(mode);
  const createFindRated = dualDailyDiscovery ? postRated : rated;
  const {
    openByClock,
    watchByClock,
    watchRows,
    watchLoading,
    watchError,
    loading: clockActivityLoading,
  } = useFreeLobbyModeClockActivity(mode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('clock');
    if (raw && isValidPlatTimeForMode(mode, raw)) {
      setClock(raw);
    }
  }, [mode]);

  const onClockChange = useCallback(
    (next: string) => {
      const coerced = coercePlatTimeForMode(mode, next);
      setClock(coerced);
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set('clock', coerced);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    },
    [mode],
  );

  const onModeChange = useCallback(noopMode, []);
  const lobbyRoom = FREE_PLAY_LOBBY_ROOM_BY_MODE[mode];
  const label = lobbyModeLabel(mode);
  const showPlayComputer = platModeExposesComputerPlay(mode);

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${nexusPrestigeRoot}`}
      data-testid={`free-lobby-mode-room-${mode}`}
      data-computer-play-enabled={showPlayComputer ? 'true' : 'false'}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-6">
        <SelfLoadingLiveGameRecoveryBanner />

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <Link
            href="/free/lobby"
            prefetch
            data-testid="free-lobby-mode-back-hub"
            className="inline-flex min-h-[48px] w-full max-w-md touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-sky-500/50 bg-gradient-to-r from-sky-950/80 to-[#0c141c] px-4 py-3 text-center text-sm font-bold tracking-tight text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.2)] transition hover:border-sky-400/70 hover:from-sky-900/90 hover:to-[#101820] hover:text-white sm:w-auto sm:px-5"
          >
            <span aria-hidden className="text-lg leading-none">
              ←
            </span>
            <span>Free Play Lobby</span>
          </Link>
          <p className="text-[11px] leading-snug text-gray-500 sm:max-w-xs sm:text-right">
            General chat, mode tiles, open-seat lights, and watch discovery live here.
          </p>
        </div>

        <h1 className="mb-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {PLAT_MODE_LABELS[mode]} <span className="text-gray-500">room</span>
        </h1>

        {showPlayComputer ? (
          <div id="free-lobby-play-computer-anchor" className="mb-6 min-w-0 scroll-mt-24">
            <FreeLobbyPlayComputerPanel mode={mode} initialClock={clock} />
          </div>
        ) : null}

        {/* Primary: Open Games should be the first visible priority panel. */}
        <div data-accl-layout="mode-room-open-games-primary" className="min-w-0 flex flex-col gap-4">
          {dualDailyDiscovery ? (
            <>
              <FreeLobbyOpenGamesList
                mode={mode}
                selectedClock={clock}
                selectedRated
                discoveryLaneLocked
                discoverySectionTitle="Rated Daily Open Games"
                openByClock={openByClock}
                clockActivityLoading={clockActivityLoading}
                onSelectClock={onClockChange}
              />
              <FreeLobbyOpenGamesList
                mode={mode}
                selectedClock={clock}
                selectedRated={false}
                discoveryLaneLocked
                discoverySectionTitle="Unrated Daily Open Games"
                openByClock={openByClock}
                clockActivityLoading={clockActivityLoading}
                onSelectClock={onClockChange}
              />
            </>
          ) : (
            <FreeLobbyOpenGamesList
              mode={mode}
              selectedClock={clock}
              selectedRated={rated}
              onRatedChange={setRated}
              openByClock={openByClock}
              clockActivityLoading={clockActivityLoading}
              onSelectClock={onClockChange}
            />
          )}
        </div>

        {/* Secondary but still top-of-page: live spectate discovery for this mode. */}
        <div className="mt-4 min-w-0" data-accl-layout="mode-room-watch-secondary">
          <FreePlayWatchSpectatorForMode
            mode={mode}
            selectedClock={clock}
            watchByClock={watchByClock}
            watchRows={watchRows}
            watchLoading={watchLoading}
            watchError={watchError}
            clockActivityLoading={clockActivityLoading}
            onSelectClock={onClockChange}
          />
        </div>

        {/* Secondary: post a seat / auto-match — below the two primary panels */}
        <section
          id="free-lobby-create-find"
          className="mt-6 rounded-xl border border-white/[0.08] bg-[#0c1018]/85 p-3 sm:p-4"
          aria-label="Create or find a game"
          data-accl-layout="mode-room-create-find-secondary"
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            Create or find a game
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-snug text-gray-500">
            {dualDailyDiscovery ? (
              <>
                <span className="text-gray-400">Rated</span> and <span className="text-gray-400">Unrated</span> open
                games stay visible above. Controls here set your lane for{' '}
                <span className="text-gray-400">Create game</span> and <span className="text-gray-400">Find match</span>{' '}
                only.
              </>
            ) : (
              <>
                Actions below use the same time control and rated setting as{' '}
                <span className="text-gray-400">Open Games</span> and <span className="text-gray-400">Watch live</span>.{' '}
                <span className="text-gray-400">Create game</span> posts your seat;{' '}
                <span className="text-gray-400">Find match</span> pairs you automatically when possible.
              </>
            )}
          </p>
          <div className="mt-3 max-w-2xl" data-testid="free-lobby-create-find-panel">
            <FreePlayMatchPanel
              mode={mode}
              onModeChange={onModeChange}
              clock={clock}
              onClockChange={onClockChange}
              rated={createFindRated}
              onRatedChange={dualDailyDiscovery ? setPostRated : setRated}
              modeLocked
              compact
              embedded
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-gray-500 sm:text-sm">
            <strong className="text-gray-400">Direct challenge</strong> —{' '}
            <Link
              href={`/free/create?mode=${encodeURIComponent(mode)}&rated=${createFindRated ? 'true' : 'false'}`}
              className="text-sky-400 underline hover:text-sky-300"
              data-testid="free-lobby-direct-challenge-link"
            >
              invite a specific player by username
            </Link>{' '}
            (private; not the public open list).
          </p>
        </section>

        <div className="mt-6 border-t border-white/[0.06] pt-6">
          <LobbyChatPanel
            lobbyRoom={lobbyRoom}
            roomLabel={label}
            heading={`${label} chat`}
            data-testid={`free-lobby-mode-chat-${mode}`}
          />
        </div>
      </div>
    </div>
  );
}
