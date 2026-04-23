"use client";

import type { ReactNode } from "react";
import { PublicIdentityCardProvider } from "@/components/identity/PublicIdentityCardContext";
import { HostLiveOpenSeatFollowListener } from "@/components/HostLiveOpenSeatFollowListener";
import { SenderChallengeGameRedirectListener } from "@/components/SenderChallengeGameRedirectListener";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PublicIdentityCardProvider>
      <SenderChallengeGameRedirectListener />
      <HostLiveOpenSeatFollowListener />
      {children}
    </PublicIdentityCardProvider>
  );
}
