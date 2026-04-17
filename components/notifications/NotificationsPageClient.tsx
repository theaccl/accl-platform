"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildClientNotifications,
  type ClientNotificationCategory,
  type ClientNotificationItem,
} from "@/lib/notifications/buildClientNotifications";
import {
  getReadNotificationIds,
  isNotificationUnread,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/notificationReadState";
import { supabase } from "@/lib/supabaseClient";

const CATEGORY_ORDER: ClientNotificationCategory[] = ["challenge", "game", "tournament", "system"];

const CATEGORY_LABEL: Record<ClientNotificationCategory, string> = {
  challenge: "Direct challenges",
  game: "Games",
  tournament: "Tournaments",
  system: "System & hub",
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export function NotificationsPageClient() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<ClientNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [readGeneration, setReadGeneration] = useState(0);

  const refreshReadUi = useCallback(() => setReadGeneration((n) => n + 1), []);

  useEffect(() => {
    const onRead = () => refreshReadUi();
    window.addEventListener("accl-notifications-read", onRead);
    return () => window.removeEventListener("accl-notifications-read", onRead);
  }, [refreshReadUi]);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await buildClientNotifications(supabase, uid);
      setItems(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const m = new Map<ClientNotificationCategory, ClientNotificationItem[]>();
    for (const c of CATEGORY_ORDER) m.set(c, []);
    for (const it of items) {
      const arr = m.get(it.category) ?? [];
      arr.push(it);
      m.set(it.category, arr);
    }
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      label: CATEGORY_LABEL[cat],
      rows: m.get(cat) ?? [],
    })).filter((g) => g.rows.length > 0);
  }, [items]);

  const unreadCount = useMemo(
    () => items.filter((i) => isNotificationUnread(i.id)).length,
    [items, readGeneration]
  );

  const markAll = () => {
    markAllNotificationsRead(items.map((i) => i.id));
    refreshReadUi();
  };

  if (!userId && !loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-gray-400">Sign in to see notifications.</p>
        <Link href="/login" className="mt-4 inline-block text-sky-400 underline">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10" data-testid="notifications-root">
      <header className="border-b border-white/[0.08] pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Activity</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white" data-testid="notifications-title">
              Notifications
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-400">
              Challenges, finished games, tournaments you are in, and hub announcements.{" "}
              <span className="text-gray-500">
                Direct messages stay in <Link className="text-sky-400/90 underline" href="/tester/messages">Mailbox</Link>
                .
              </span>
            </p>
          </div>
          {items.length > 0 && unreadCount > 0 ? (
            <button
              type="button"
              data-testid="notifications-mark-all-read"
              onClick={markAll}
              className="shrink-0 rounded-lg border border-white/10 bg-[#151d2c] px-3 py-2 text-sm text-gray-200 transition hover:border-white/20 hover:bg-[#1a2231]"
            >
              Mark all read
            </button>
          ) : null}
        </div>
      </header>

      {err ? (
        <p className="mt-6 text-sm text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-10 text-sm text-gray-500" data-testid="notifications-loading">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <div
          className="mt-10 rounded-2xl border border-dashed border-white/10 bg-[#0f141c] px-6 py-14 text-center"
          data-testid="notifications-empty"
        >
          <p className="text-lg font-medium text-gray-300">You are all caught up</p>
          <p className="mt-2 text-sm text-gray-500">
            No notifications right now. Play a game, join a tournament, or check back after hub updates.
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {grouped.map((g) => (
            <section key={g.category} aria-labelledby={`notif-cat-${g.category}`}>
              <h2
                id={`notif-cat-${g.category}`}
                className="text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                {g.label}
              </h2>
              <ul className="mt-3 space-y-2">
                {g.rows.map((row) => {
                  const unread = isNotificationUnread(row.id);
                  return (
                    <li key={row.id}>
                      <Link
                        href={row.href}
                        data-testid={`notification-row-${row.id}`}
                        onClick={() => {
                          markNotificationRead(row.id);
                          refreshReadUi();
                        }}
                        className={`flex flex-col gap-1 rounded-xl border px-4 py-3 transition sm:flex-row sm:items-baseline sm:justify-between ${
                          unread
                            ? "border-sky-500/35 bg-sky-950/25 shadow-[inset_3px_0_0_0_rgba(56,189,248,0.65)]"
                            : "border-white/[0.06] bg-[#111723] hover:border-white/10"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${unread ? "text-white" : "text-gray-200"}`}>{row.title}</p>
                          <p className="mt-0.5 text-sm leading-snug text-gray-400">{row.body}</p>
                        </div>
                        <time
                          className="shrink-0 text-xs text-gray-500 sm:ml-4 sm:text-right"
                          dateTime={row.at}
                        >
                          {formatWhen(row.at)}
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-12 text-center text-xs text-gray-600">
        Read state is stored on this device until server-backed notifications ship.
      </p>
    </div>
  );
}
