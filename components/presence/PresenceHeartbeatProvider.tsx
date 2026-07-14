"use client";

import { useEffect, useState } from "react";

import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { supabase } from "@/lib/supabaseClient";

/**
 * Global authenticated presence heartbeat provider (Phase 1).
 * No UI; records per-tab heartbeats while the ACCL page is active.
 */
export function PresenceHeartbeatProvider({ children }: { children: React.ReactNode }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user?.id ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSessionUserId(data.session?.user?.id ?? null);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  usePresenceHeartbeat(sessionUserId);

  return <>{children}</>;
}
