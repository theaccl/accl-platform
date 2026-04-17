"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { buildClientNotifications } from "@/lib/notifications/buildClientNotifications";
import { getReadNotificationIds } from "@/lib/notifications/notificationReadState";
import { supabase } from "@/lib/supabaseClient";

const navBtnSite =
  "relative text-sm text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-[#1a2231] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40";

/**
 * Top-bar entry + unread badge (client read-state vs aggregated feed).
 */
export function NotificationsNavLink() {
  const [userId, setUserId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onRead = () => void refresh();
    window.addEventListener("accl-notifications-read", onRead);
    const id = window.setInterval(() => void refresh(), 90_000);
    return () => {
      window.removeEventListener("accl-notifications-read", onRead);
      window.clearInterval(id);
    };
  }, [refresh]);

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
