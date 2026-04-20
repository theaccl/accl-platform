'use client';

import Link from 'next/link';

import { LobbyChatPanel } from '@/components/free/LobbyChatPanel';
import { FreePlayOpenPairingByMode } from '@/components/free/FreePlayOpenPairingByMode';
import NexusLobbyActionsBar from '@/components/nexus/NexusLobbyActionsBar';
import { nexusPrestigeRoot } from '@/components/nexus/nexusShellTheme';
import { nexusModuleHeadingClass } from '@/components/nexus/NexusHeader';
import { useFreeOpenSeatActivity } from '@/hooks/useFreeOpenSeatActivity';
import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { FREE_PLAY_LOBBY_GENERAL_ROOM } from '@/lib/lobbyChatRooms';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e12]';

/**
 * Lobby Chat hub: optional general chat + mode room entry (navigation to `/free/lobby/[mode]`).
 */
export function FreeLobbyHubContent() {
  const { activity, loading } = useFreeOpenSeatActivity();

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${nexusPrestigeRoot}`}>
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-5 sm:pt-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Lobby Chat</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
            General lobby is for cross-mode coordination. For mode-scoped chat and queue, open a{' '}
            <strong className="text-gray-300">mode room</strong> — time controls there only filter open games, not chat.
          </p>
        </header>

        <FreePlayOpenPairingByMode activity={activity} loading={loading} />

        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-8">
          <LobbyChatPanel
            lobbyRoom={FREE_PLAY_LOBBY_GENERAL_ROOM}
            roomLabel="General"
            heading="General lobby chat"
            data-testid="free-lobby-hub-general-chat"
          />

          <section
            id="mode-rooms"
            className="rounded-2xl border border-[#243244] bg-[#111a27] p-4 sm:p-5"
            aria-label="Mode rooms"
          >
            <h2 className={nexusModuleHeadingClass}>Mode rooms</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              Each mode has one shared chat (e.g. all Blitz players share Blitz chat). Pick a clock inside the room to
              filter the queue.
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2">
              {PLAT_MODE_ORDER.map((m: PlatMode) => (
                <li key={m}>
                  <Link
                    href={`/free/lobby/${m}`}
                    className={`flex min-h-[48px] items-center justify-center rounded-xl border border-red-900/50 bg-gradient-to-b from-red-950/40 to-red-950/70 px-4 py-3 text-center text-sm font-semibold text-red-50 shadow-md shadow-red-950/30 transition hover:border-red-500/45 hover:from-red-900/50 hover:to-red-950/85 ${focusRing}`}
                    data-testid={`free-lobby-hub-enter-${m}`}
                  >
                    {PLAT_MODE_LABELS[m]}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <NexusLobbyActionsBar
        publicGameHref="/free/lobby/blitz#free-find-match-anchor"
        directChallengeHref="/free/create"
      />
    </div>
  );
}
