'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { FreeLobbyOpenGamesList } from '@/components/free/FreeLobbyOpenGamesList';
import { LobbyChatPanel } from '@/components/free/LobbyChatPanel';
import { FreePlayMatchPanel } from '@/components/FreePlayMatchPanel';
import NexusLobbyActionsBar from '@/components/nexus/NexusLobbyActionsBar';
import { nexusPrestigeRoot } from '@/components/nexus/nexusShellTheme';
import {
  coercePlatTimeForMode,
  defaultPlatTimeControl,
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
 * Single mode room: mode title, match controls (time = queue filter), open games, mode chat (not time-scoped).
 */
export function FreeLobbyModeRoomContent({ mode }: Props) {
  const [clock, setClock] = useState<string>(() => defaultPlatTimeControl(mode));
  const [rated, setRated] = useState(true);

  const onModeChange = useCallback(noopMode, []);
  const lobbyRoom = FREE_PLAY_LOBBY_ROOM_BY_MODE[mode];
  const label = lobbyModeLabel(mode);

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${nexusPrestigeRoot}`}>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-6">
        <nav className="mb-4 text-sm">
          <Link
            href="/free/lobby"
            className="font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
            data-testid="free-lobby-mode-back-hub"
          >
            ← Lobby Chat hub
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {PLAT_MODE_LABELS[mode]} <span className="text-gray-500">room</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
            One shared <strong className="text-gray-300">{label}</strong> conversation. Time control and rated settings
            filter the open games list and Find Match — they do not change chat rooms.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-2xl border border-white/[0.06] bg-[#0c1018]/80 p-4 sm:p-5" aria-label="Queue: create, find match, or use Open Games">
              <h2 className="text-lg font-semibold tracking-tight text-white">Queue</h2>
              <p className="mt-1 text-xs text-gray-500">
                Same filters for <strong className="text-gray-400">Create game</strong>,{' '}
                <strong className="text-gray-400">Find match</strong>, and the Open Games list. Not a private invite.
              </p>
              <div className="mt-4">
                <FreePlayMatchPanel
                  mode={mode}
                  onModeChange={onModeChange}
                  clock={clock}
                  onClockChange={(c) => setClock(coercePlatTimeForMode(mode, c))}
                  rated={rated}
                  onRatedChange={setRated}
                  modeLocked
                  compact
                />
              </div>
            </section>

            <FreeLobbyOpenGamesList mode={mode} selectedClock={clock} selectedRated={rated} />

            <p className="text-sm text-gray-500">
              <strong className="text-gray-400">Direct challenge</strong> —{' '}
              <Link
                href={`/free/create?mode=${encodeURIComponent(mode)}&rated=${rated ? 'true' : 'false'}`}
                className="text-sky-400 underline hover:text-sky-300"
                data-testid="free-lobby-direct-challenge-link"
              >
                invite a specific player by username
              </Link>{' '}
              (private; does not use the public list).
            </p>
          </div>

          <LobbyChatPanel
            lobbyRoom={lobbyRoom}
            roomLabel={label}
            heading={`${label} chat`}
            data-testid={`free-lobby-mode-chat-${mode}`}
          />
        </div>
      </div>

      <NexusLobbyActionsBar
        publicGameHref="#free-find-match-anchor"
        directChallengeHref={`/free/create?mode=${encodeURIComponent(mode)}&rated=${rated ? 'true' : 'false'}`}
      />
    </div>
  );
}
