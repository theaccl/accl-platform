"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  clearHostLiveOpenSeatFollow,
  HOST_LIVE_OPEN_SEAT_CLEAR_EVENT,
  HOST_LIVE_OPEN_SEAT_REGISTER_EVENT,
  readStoredHostLiveOpenSeatGameId,
} from "@/lib/hostLiveOpenSeatFollow";
import { rowIndicatesLiveFreePlayPacing } from "@/lib/freePlayLiveSession";
import { parseGameIdFromPath } from "@/lib/gameAcceptRedirectPriority";
import { supabase } from "@/lib/supabaseClient";

type GameRowMin = {
  id: string;
  white_player_id: string;
  black_player_id: string | null;
  tempo?: string | null;
  live_time_control?: string | null;
  status: string;
  play_context?: string | null;
  tournament_id?: string | null;
};

function normId(v: unknown): string {
  return String(v ?? "").trim();
}

function hostShouldPushToGame(pathname: string, gameId: string): boolean {
  const cur = parseGameIdFromPath(pathname);
  return cur !== gameId;
}

function removeChannelSafe(chRef: { current: ReturnType<typeof supabase.channel> | null }) {
  if (chRef.current) {
    void supabase.removeChannel(chRef.current);
    chRef.current = null;
  }
}

/**
 * Scoped host follow: **one** Realtime subscription `games` UPDATE with `filter: id=eq.<openSeatGameId>`,
 * only while this session registered a live open seat the user still owns and is waiting on.
 */
export function HostLiveOpenSeatFollowListener() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const pathnameRef = useRef(pathname);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  /** Always start null — hydrate from sessionStorage after mount to avoid SSR/client hydration mismatch. */
  const [watchGameId, setWatchGameId] = useState<string | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const stored = readStoredHostLiveOpenSeatGameId();
    if (stored) setWatchGameId(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setSessionUserId(session?.user?.id ?? null);
      if (event === "SIGNED_OUT") {
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
      }
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

  useEffect(() => {
    const onRegister = (e: Event) => {
      const ce = e as CustomEvent<{ gameId?: string }>;
      const id = normId(ce.detail?.gameId);
      if (id) setWatchGameId(id);
    };
    const onClear = () => {
      setWatchGameId(null);
    };
    window.addEventListener(HOST_LIVE_OPEN_SEAT_REGISTER_EVENT, onRegister as EventListener);
    window.addEventListener(HOST_LIVE_OPEN_SEAT_CLEAR_EVENT, onClear);
    return () => {
      window.removeEventListener(HOST_LIVE_OPEN_SEAT_REGISTER_EVENT, onRegister as EventListener);
      window.removeEventListener(HOST_LIVE_OPEN_SEAT_CLEAR_EVENT, onClear);
    };
  }, []);

  useEffect(() => {
    if (!watchGameId || !sessionUserId) {
      return;
    }
    const gid = watchGameId;
    const uid = sessionUserId;
    let cancelled = false;
    const chRef: { current: ReturnType<typeof supabase.channel> | null } = { current: null };

    void (async () => {
      const { data: row, error } = await supabase
        .from("games")
        .select("id,white_player_id,black_player_id,tempo,live_time_control,status,play_context,tournament_id")
        .eq("id", gid)
        .maybeSingle();

      if (cancelled) return;

      if (error || !row) {
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
        return;
      }

      const g = row as GameRowMin;
      if (String(g.play_context ?? "") !== "free" || g.tournament_id) {
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
        return;
      }
      if (!rowIndicatesLiveFreePlayPacing({ tempo: g.tempo, live_time_control: g.live_time_control })) {
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
        return;
      }
      if (normId(g.white_player_id) !== uid) {
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
        return;
      }
      if (!["active", "waiting"].includes(String(g.status ?? ""))) {
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
        return;
      }

      const blackNow = normId(g.black_player_id);
      if (blackNow) {
        if (hostShouldPushToGame(pathnameRef.current, gid)) {
          router.push(`/game/${gid}`);
        }
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
        return;
      }

      if (cancelled) return;

      const ch = supabase
        .channel(`host-live-open-seat-${gid}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "games",
            filter: `id=eq.${gid}`,
          },
          (payload) => {
            const nw = payload.new as Record<string, unknown>;
            if (normId(nw.id) !== gid) return;

            const b = nw.black_player_id;
            if (b != null && String(b).trim() !== "") {
              if (hostShouldPushToGame(pathnameRef.current, gid)) {
                router.push(`/game/${gid}`);
              }
              clearHostLiveOpenSeatFollow();
              setWatchGameId(null);
              removeChannelSafe(chRef);
              return;
            }

            const st = String(nw.status ?? "");
            if (st === "finished") {
              clearHostLiveOpenSeatFollow();
              setWatchGameId(null);
              removeChannelSafe(chRef);
              return;
            }
            const okWaitingHost =
              String(nw.play_context ?? "") === "free" &&
              !nw.tournament_id &&
              rowIndicatesLiveFreePlayPacing({
                tempo: nw.tempo as string | null | undefined,
                live_time_control: nw.live_time_control as string | null | undefined,
              }) &&
              normId(nw.white_player_id) === uid &&
              (st === "active" || st === "waiting");

            if (!okWaitingHost) {
              clearHostLiveOpenSeatFollow();
              setWatchGameId(null);
              removeChannelSafe(chRef);
            }
          },
        )
        .subscribe();

      if (cancelled) {
        void supabase.removeChannel(ch);
        return;
      }
      chRef.current = ch;
    })();

    return () => {
      cancelled = true;
      removeChannelSafe(chRef);
    };
  }, [watchGameId, sessionUserId, router]);

  return null;
}
