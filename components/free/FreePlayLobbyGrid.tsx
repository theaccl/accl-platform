"use client";

import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { DirectChallengePanel } from "@/components/DirectChallengePanel";
import { FreePlayMatchPanel } from "@/components/FreePlayMatchPanel";
import { HomePlaySection } from "@/components/HomePlaySection";
import { FreeLobbyOpenGamesList } from "@/components/free/FreeLobbyOpenGamesList";
import NexusLobbyActionsBar from "@/components/nexus/NexusLobbyActionsBar";
import NexusLobbyChatColumn, { type LobbyPlatMode } from "@/components/nexus/NexusLobbyChatColumn";
import { FreePlayOpenPairingByMode } from "@/components/free/FreePlayOpenPairingByMode";
import {
  coercePlatTimeForMode,
  defaultPlatTimeControl,
  type PlatMode,
} from "@/lib/freePlayModeTimeControl";
import { useFreeOpenSeatActivity } from "@/hooks/useFreeOpenSeatActivity";
import { nexusPrestigeRoot } from "@/components/nexus/nexusShellTheme";

/**
 * Legacy single-page free lobby (all modes + inline mode chat switcher).
 * Used only by `/free/play`. Primary flow is `/free/lobby` → `/free/lobby/[mode]`.
 */
export function FreePlayLobbyGrid({ children }: { children?: ReactNode }) {
  const [mode, setMode] = useState<PlatMode>("blitz");
  const [clock, setClock] = useState<string>(() => defaultPlatTimeControl("blitz"));
  const [rated, setRated] = useState(true);

  const handleModeChange = useCallback((m: LobbyPlatMode) => {
    setMode(m);
    setClock((prev) => coercePlatTimeForMode(m, prev));
  }, []);

  const { activity: openSeatActivity, loading: openSeatLoading } = useFreeOpenSeatActivity();

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${nexusPrestigeRoot}`}>
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-5 sm:pt-6">
        <FreePlayOpenPairingByMode activity={openSeatActivity} loading={openSeatLoading} />
      </div>
      <div className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 items-start gap-5 px-4 py-5 sm:gap-6 sm:px-5 sm:py-6 lg:grid-cols-2 lg:gap-8 lg:py-6">
        <div className="min-w-0 w-full lg:max-h-[min(70vh,560px)] lg:overflow-y-auto">
          <FreeLobbyOpenGamesList mode={mode} selectedClock={clock} selectedRated={rated} />
        </div>
        <div className="min-w-0 w-full lg:max-h-[min(70vh,560px)] lg:overflow-y-auto">
          <NexusLobbyChatColumn
            mode={mode}
            onModeChange={handleModeChange}
            openSeatActivity={openSeatActivity}
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 sm:px-6 sm:py-5">
        {children}
        <HomePlaySection mode={mode} clock={clock} rated={rated} />
      </div>

      <NexusLobbyActionsBar publicGameHref="#free-find-match-anchor" />

      <div className="w-full min-w-0">
        <FreePlayMatchPanel
          mode={mode}
          onModeChange={handleModeChange}
          clock={clock}
          onClockChange={setClock}
          rated={rated}
          onRatedChange={setRated}
        />
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-2 sm:px-6 sm:pb-12">
        <DirectChallengePanel anchorId="direct-challenge" />
      </div>
    </div>
  );
}
