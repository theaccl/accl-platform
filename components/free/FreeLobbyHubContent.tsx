'use client';

import Link from 'next/link';

import { FreeLobbyCurrentGamesPanel } from '@/components/free/FreeLobbyCurrentGamesPanel';
import { LobbyChatPanel } from '@/components/free/LobbyChatPanel';
import { FreePlayOpenPairingByMode } from '@/components/free/FreePlayOpenPairingByMode';
import { FreePlayWatchSpectatorByMode } from '@/components/free/FreePlayWatchSpectatorByMode';
import { nexusPrestigeRoot } from '@/components/nexus/nexusShellTheme';
import { useFreeOpenSeatActivity } from '@/hooks/useFreeOpenSeatActivity';
import { useFreePlayWatchList } from '@/hooks/useFreePlayWatchList';
import {
  PLAT_MODE_LABELS,
  PLAT_MODE_ORDER,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';
import { FREE_PLAY_LOBBY_GENERAL_ROOM } from '@/lib/lobbyChatRooms';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e12]';

/**
 * Free Play command center — obligations first, then pairing, spectate, compact chat.
 *
 * Follow-up (not in scope): live tournament game pages should expose a side panel with other
 * active tournament boards, bracket state, round label, and clickable game swaps.
 */
export function FreeLobbyHubContent() {
  const { activity, counts: openSeatCounts, loading } = useFreeOpenSeatActivity();
  const watchList = useFreePlayWatchList('adult');

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${nexusPrestigeRoot}`}>
      <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5 sm:px-5 sm:pt-6">
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl" data-testid="free-lobby-hub-title">
            Free Play Lobby
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
            Your move and live obligations come first — then open seats and spectating. Mode rooms stay available when
            you need a specific clock or chat channel.
          </p>
        </header>

        <FreeLobbyCurrentGamesPanel />

        <FreePlayOpenPairingByMode
          activity={activity}
          openSeatCounts={openSeatCounts}
          loading={loading}
          activeSeatsOnly
        />

        <FreePlayWatchSpectatorByMode
          loading={watchList.loading}
          error={watchList.error}
          data={watchList.data}
          liveBoardsOnly
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
            Mode rooms (Bullet, Blitz, Rapid, Daily)
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            Open a mode room for scoped chat, queue filters, and play-vs-computer (live modes). Open public pairing above
            jumps straight to waiting seats when lit.
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
