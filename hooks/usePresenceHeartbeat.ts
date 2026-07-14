"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
  createPresenceHeartbeatController,
  createPresenceHeartbeatSender,
  PRESENCE_MEANINGFUL_INTERACTION_EVENTS,
} from "@/lib/presence/presenceHeartbeatController";
import type { PresenceVisibility } from "@/lib/presence/heartbeatContract";
import { getOrCreateTabPresenceId } from "@/lib/presence/tabPresenceId";
import { supabase } from "@/lib/supabaseClient";

function currentVisibility(): PresenceVisibility {
  if (typeof document === "undefined") return "visible";
  return document.visibilityState === "visible" ? "visible" : "hidden";
}

/**
 * Per-tab presence heartbeat for authenticated sessions only.
 */
export function usePresenceHeartbeat(sessionUserId: string | null): void {
  const pathname = usePathname() ?? "";
  const controllerRef = useRef<ReturnType<typeof createPresenceHeartbeatController> | null>(null);
  const tabPresenceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionUserId) {
      controllerRef.current?.stop();
      controllerRef.current = null;
      return;
    }

    if (!tabPresenceIdRef.current) {
      tabPresenceIdRef.current = getOrCreateTabPresenceId();
    }
    if (!tabPresenceIdRef.current) {
      return;
    }

    const controller = createPresenceHeartbeatController({
      tabPresenceId: tabPresenceIdRef.current,
      send: createPresenceHeartbeatSender(supabase),
      getVisibility: currentVisibility,
    });
    controllerRef.current = controller;
    controller.start();

    const onVisibility = () => controller.onVisibilityChange();
    const onFocus = () => controller.onPromptEvent();
    const onPageShow = () => controller.onPromptEvent();
    const onOnline = () => controller.onOnline();
    const onInteraction = () => controller.onMeaningfulInteraction();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);

    for (const eventName of PRESENCE_MEANINGFUL_INTERACTION_EVENTS) {
      window.addEventListener(eventName, onInteraction, { passive: true });
    }

    return () => {
      controller.stop();
      controllerRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      for (const eventName of PRESENCE_MEANINGFUL_INTERACTION_EVENTS) {
        window.removeEventListener(eventName, onInteraction);
      }
    };
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId || !controllerRef.current) return;
    controllerRef.current.onRouteChange();
  }, [pathname, sessionUserId]);
}
