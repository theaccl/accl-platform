"use client";

import { LobbyChatPanel } from "@/components/free/LobbyChatPanel";
import { FREE_PLAY_LOBBY_ROOM_BY_MODE, lobbyModeLabel } from "@/lib/lobbyChatRooms";
import { nexusPrestigeCard } from "@/components/nexus/nexusShellTheme";
import { nexusModuleHeadingClass } from "@/components/nexus/NexusHeader";

export type LobbyPlatMode = "bullet" | "blitz" | "rapid" | "daily";

type Props = {
  mode: LobbyPlatMode;
  onModeChange: (m: LobbyPlatMode) => void;
  openSeatActivity?: Record<LobbyPlatMode, boolean>;
  /** When false, mode chips are hidden (mode is fixed by route). */
  showModeSwitcher?: boolean;
};

const modes: LobbyPlatMode[] = ["bullet", "blitz", "rapid", "daily"];

/**
 * Legacy column: mode switcher + mode-scoped chat. Prefer `/free/lobby` hub + `/free/lobby/[mode]` for new UX.
 */
export default function NexusLobbyChatColumn({
  mode,
  onModeChange,
  openSeatActivity,
  showModeSwitcher = true,
}: Props) {
  const lobbyRoom = FREE_PLAY_LOBBY_ROOM_BY_MODE[mode];
  const roomLabel = lobbyModeLabel(mode);

  return (
    <div className="flex min-w-0 flex-col gap-0" data-testid="nexus-lobby-chat-column">
      {showModeSwitcher ? (
        <section
          className={`${nexusPrestigeCard} mb-3 flex flex-col overflow-hidden p-4 sm:p-5`}
          aria-label="Lobby mode"
        >
          <h2 className={nexusModuleHeadingClass}>Mode</h2>
          <p className="mt-2 text-xs leading-snug text-gray-500">
            Pick a mode to switch chat rooms. For the hub layout, use{" "}
            <span className="text-gray-400">Lobby Chat</span> and enter a mode room.
          </p>
          <div className="mb-0 mt-4 flex flex-wrap gap-2">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`free-lobby-mode-${m}`}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-[transform,background-color,border-color,box-shadow,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e12] motion-safe:active:scale-[0.98] motion-reduce:active:scale-100 ${
                  mode === m
                    ? "border-transparent bg-gradient-to-b from-red-900/50 to-red-950/80 text-white shadow-md shadow-red-950/40 ring-1 ring-red-500/60"
                    : "border-white/12 bg-[#0c0e12] text-gray-400 hover:border-white/25 hover:bg-white/[0.04] hover:text-gray-100 active:bg-white/[0.06]"
                }`}
                onClick={() => onModeChange(m)}
                title={
                  openSeatActivity?.[m]
                    ? `${lobbyModeLabel(m)}: open public seat available`
                    : `${lobbyModeLabel(m)}: no open seat in this mode`
                }
              >
                {openSeatActivity?.[m] ? (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
                    aria-hidden
                  />
                ) : null}
                {m}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <LobbyChatPanel
        lobbyRoom={lobbyRoom}
        roomLabel={roomLabel}
        heading="Mode chat"
        data-testid="nexus-lobby-chat-column-inner"
        draftTestId="free-lobby-chat-draft"
        sendButtonTestId="free-lobby-chat-send"
      />
    </div>
  );
}
