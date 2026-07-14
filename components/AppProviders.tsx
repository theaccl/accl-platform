"use client";

import type { ReactNode } from "react";
import { PublicIdentityCardProvider } from "@/components/identity/PublicIdentityCardContext";
import { HostLiveOpenSeatFollowListener } from "@/components/HostLiveOpenSeatFollowListener";
import { SenderChallengeGameRedirectListener } from "@/components/SenderChallengeGameRedirectListener";
import { PresenceHeartbeatProvider } from "@/components/presence/PresenceHeartbeatProvider";
import { TournamentSessionRedirectListener } from "@/components/tournament/TournamentSessionRedirectListener";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PublicIdentityCardProvider>
      <PresenceHeartbeatProvider>
        <SenderChallengeGameRedirectListener />
        <HostLiveOpenSeatFollowListener />
        <TournamentSessionRedirectListener />
        {children}
      </PresenceHeartbeatProvider>
    </PublicIdentityCardProvider>
  );
}
