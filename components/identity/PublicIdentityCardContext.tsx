"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PublicIdentityCard } from "@/components/identity/PublicIdentityCard";

type PublicIdentityCardContextValue = {
  openForPlayer: (playerId: string) => void;
  close: () => void;
};

const PublicIdentityCardContext = createContext<PublicIdentityCardContextValue | null>(null);

export function usePublicIdentityCard(): PublicIdentityCardContextValue | null {
  return useContext(PublicIdentityCardContext);
}

/** `openForPlayer(id)` when `PublicIdentityCardProvider` is mounted; otherwise `null`. */
export function useOpenPublicIdentityCard(): ((playerId: string) => void) | null {
  const ctx = useContext(PublicIdentityCardContext);
  return ctx?.openForPlayer ?? null;
}

export function PublicIdentityCardProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<string | null>(null);

  const close = useCallback(() => setPlayerId(null), []);
  const openForPlayer = useCallback((id: string) => {
    const t = id.trim();
    if (t) setPlayerId(t);
  }, []);

  const value = useMemo(() => ({ openForPlayer, close }), [openForPlayer, close]);

  return (
    <PublicIdentityCardContext.Provider value={value}>
      {children}
      {playerId ? <PublicIdentityCard playerId={playerId} onClose={close} /> : null}
    </PublicIdentityCardContext.Provider>
  );
}
