'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { FreeLobbyOpenGamesList } from '@/components/free/FreeLobbyOpenGamesList';
import { FreePlayWatchSpectatorForMode } from '@/components/free/FreePlayWatchSpectatorForMode';
import { LobbyChatPanel } from '@/components/free/LobbyChatPanel';
import { FreePlayMatchPanel } from '@/components/FreePlayMatchPanel';
import NexusLobbyActionsBar from '@/components/nexus/NexusLobbyActionsBar';
import { nexusPrestigeRoot } from '@/components/nexus/nexusShellTheme';
import {
  coercePlatTimeForMode,
  defaultPlatTimeControl,
  isValidPlatTimeForMode,
  PLAT_MODE_LABELS,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';
import { FREE_PLAY_LOBBY_ROOM_BY_MODE, lobbyModeLabel } from '@/lib/lobbyChatRooms';

type Props = {
  mode: PlatMode;
};

const noopMode = (_m: PlatMode) => {
  void _m;
};

/**
 * Mode room hierarchy: (1) Open Games + Watch live row → (2) Create/Find → (3) chat.
 */
export function FreeLobbyModeRoomContent({ mode }: Props) {
  const [clock, setClock] = useState<string>(() => defaultPlatTimeControl(mode));
  const [rated, setRated] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('clock');
    if (raw && isValidPlatTimeForMode(mode, raw)) {
      setClock(raw);
    }
  }, [mode]);

  const onModeChange = useCallback(noopMode, []);
  const lobbyRoom = FREE_PLAY_LOBBY_ROOM_BY_MODE[mode];
  const label = lobbyModeLabel(mode);

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${nexusPrestigeRoot}`}>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-6">
        <nav className="mb-3 text-sm">
          <Link
            href="/free/lobby"
            className="font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
            data-testid="free-lobby-mode-back-hub"
          >
            ← Lobby Chat hub
          </Link>
        </nav>

        <h1 className="mb-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {PLAT_MODE_LABELS[mode]} <span className="text-gray-500">room</span>
        </h1>

        {/* Primary: Open Games should be the first visible priority panel. */}
        <div data-accl-layout="mode-room-open-games-primary" className="min-w-0">
          <FreeLobbyOpenGamesList mode={mode} selectedClock={clock} selectedRated={rated} />
        </div>

        {/* Secondary but still top-of-page: live spectate discovery for this mode. */}
        <div className="mt-4 min-w-0" data-accl-layout="mode-room-watch-secondary">
          <FreePlayWatchSpectatorForMode mode={mode} selectedClock={clock} />
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
            Actions below use the same time control and rated setting as <span className="text-gray-400">Open Games</span>{' '}
            and <span className="text-gray-400">Watch live</span>. <span className="text-gray-400">Create game</span> posts
            your seat; <span className="text-gray-400">Find match</span> pairs you automatically when possible.
          </p>
          <div className="mt-3 max-w-2xl">
            <FreePlayMatchPanel
              mode={mode}
              onModeChange={onModeChange}
              clock={clock}
              onClockChange={(c) => setClock(coercePlatTimeForMode(mode, c))}
              rated={rated}
              onRatedChange={setRated}
              modeLocked
              compact
              embedded
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-gray-500 sm:text-sm">
            <strong className="text-gray-400">Direct challenge</strong> —{' '}
            <Link
              href={`/free/create?mode=${encodeURIComponent(mode)}&rated=${rated ? 'true' : 'false'}`}
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

      <NexusLobbyActionsBar
        watchSpectatorHref="#watch-as-spectator-anchor"
        watchSpectatorLabel="Watch live"
        publicGameHref="#free-lobby-open-games-anchor"
        publicGameScrollLabel="Open games"
        directChallengeHref={`/free/create?mode=${encodeURIComponent(mode)}&rated=${rated ? 'true' : 'false'}`}
      />
    </div>
  );
}
