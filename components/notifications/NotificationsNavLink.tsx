"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { buildClientNotifications } from "@/lib/notifications/buildClientNotifications";
import { getReadNotificationIds } from "@/lib/notifications/notificationReadState";
import { supabase } from "@/lib/supabaseClient";

const navBtnSite =
  "relative text-sm text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-[#1a2231] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40";

/**
 * Top-bar entry + unread badge (client read-state vs aggregated feed).
 */
export function NotificationsNavLink() {
  const pathname = usePathname() ?? "";
  const [userId, setUserId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async (knownUserId?: string | null) => {
    let uid = knownUserId ?? userId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
      setUserId(uid);
    }
    if (!uid) {
      setUnread(0);
      return;
    }
    try {
      const items = await buildClientNotifications(supabase, uid);
      const read = getReadNotificationIds();
      const n = items.filter((i) => !read.has(i.id)).length;
      setUnread(n);
    } catch {
      setUnread(0);
    }
  }, [userId]);

  useEffect(() => {
    void refresh(null);
  }, [refresh]);

  useEffect(() => {
    const onRead = () => void refresh(userId);
    window.addEventListener("accl-notifications-read", onRead);
    const inHotPath = pathname.startsWith("/free/lobby") || pathname.startsWith("/game/");
    const pollMs = inHotPath ? 300_000 : 90_000;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refresh(userId);
    }, pollMs);
    return () => {
      window.removeEventListener("accl-notifications-read", onRead);
      window.clearInterval(id);
    };
  }, [refresh, pathname, userId]);

  return (
    <Link href="/notifications" className={`${navBtnSite} whitespace-nowrap`} data-testid="nav-notifications-link">
      Notifications
      {userId && unread > 0 ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-bold text-white"
          aria-label={`${unread} unread notifications`}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
