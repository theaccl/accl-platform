"use client";

import { useState } from "react";
import { DirectChallengePanel } from "@/components/DirectChallengePanel";
import { FreePlayMatchPanel } from "@/components/FreePlayMatchPanel";
import NexusLobbyActionsBar from "@/components/nexus/NexusLobbyActionsBar";
import NexusLobbyChatColumn, { type LobbyPlatMode } from "@/components/nexus/NexusLobbyChatColumn";
import NexusOpenGamesColumn from "@/components/nexus/NexusOpenGamesColumn";
import { nexusPrestigeRoot } from "@/components/nexus/nexusShellTheme";

/**
 * P3 free lobby: open games + mode chat (split on lg), then home strip, sticky actions, match + challenge.
 */
export function FreePlayLobbyGrid({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<LobbyPlatMode>("blitz");

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${nexusPrestigeRoot}`}>
      <div className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 items-start gap-5 px-4 py-5 sm:gap-6 sm:px-5 sm:py-6 lg:grid-cols-2 lg:gap-8 lg:py-6">
        <div className="min-w-0 w-full lg:max-h-[min(70vh,560px)] lg:overflow-y-auto">
          <NexusOpenGamesColumn />
        </div>
        <div className="min-w-0 w-full lg:max-h-[min(70vh,560px)] lg:overflow-y-auto">
          <NexusLobbyChatColumn mode={mode} onModeChange={setMode} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 sm:px-6 sm:py-5">{children}</div>

      <NexusLobbyActionsBar />

      <div className="w-full min-w-0">
        <FreePlayMatchPanel mode={mode} onModeChange={setMode} />
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-2 sm:px-6 sm:pb-12">
        <DirectChallengePanel anchorId="direct-challenge" />
      </div>
    </div>
  );
}
