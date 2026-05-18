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
import { normalizeGameTempo } from "@/lib/gameTempo";
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

/** Poll + SUBSCRIBED re-check: catches races where the UPDATE happens before the channel is ready. */
const HOST_FOLLOW_OPEN_POLL_MS = 2200;

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
    const onPageShow = () => {
      const id = readStoredHostLiveOpenSeatGameId();
      if (id) {
        setWatchGameId((prev) => (prev === id ? prev : id));
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
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

  /**
   * Fallback arm: if registration was missed (tab restore/browser storage oddities),
   * recover the host's newest waiting live open seat from DB and attach follow.
   */
  useEffect(() => {
    if (!sessionUserId || watchGameId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('games')
        .select('id,white_player_id,black_player_id,tempo,live_time_control,status,play_context,tournament_id,updated_at')
        .eq('play_context', 'free')
        .is('tournament_id', null)
        .eq('white_player_id', sessionUserId)
        .is('black_player_id', null)
        .in('status', ['active', 'waiting'])
        .order('updated_at', { ascending: false })
        .limit(6);
      if (cancelled || error || !data?.length) return;
      const hit = (data as GameRowMin[]).find((g) =>
        rowIndicatesLiveFreePlayPacing({ tempo: g.tempo, live_time_control: g.live_time_control })
      );
      if (!hit?.id) return;
      const gid = normId(hit.id);
      if (!gid) return;
      setWatchGameId(gid);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId, watchGameId]);

  useEffect(() => {
    if (!watchGameId || !sessionUserId) {
      return;
    }
    const gid = watchGameId;
    const uid = sessionUserId;
    let cancelled = false;
    const chRef: { current: ReturnType<typeof supabase.channel> | null } = { current: null };
    const intervalRef = { current: null as number | null };

    const finishIfBlackSeated = (g: GameRowMin) => {
      const blackNow = normId(g.black_player_id);
      if (blackNow) {
        if (hostShouldPushToGame(pathnameRef.current, gid)) {
          router.push(`/game/${gid}`);
        }
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
        removeChannelSafe(chRef);
        return true;
      }
      return false;
    };

    const validateStillWaitingHost = (g: GameRowMin) => {
      if (String(g.play_context ?? "") !== "free" || g.tournament_id) {
        return false;
      }
      if (normId(g.white_player_id) !== uid) {
        return false;
      }
      if (!["active", "waiting"].includes(String(g.status ?? ""))) {
        return false;
      }
      // Prefer live-seated detection; do not drop follow on a single mis-tagged `live_time_control` row.
      const t = normalizeGameTempo(g.tempo);
      const looksLive =
        t === "live" ||
        rowIndicatesLiveFreePlayPacing({ tempo: g.tempo, live_time_control: g.live_time_control });
      if (!looksLive) {
        return false;
      }
      return true;
    };

    void (async () => {
      const fetchRow = () =>
        supabase
          .from("games")
          .select("id,white_player_id,black_player_id,tempo,live_time_control,status,play_context,tournament_id")
          .eq("id", gid)
          .maybeSingle();

      const { data: row, error } = await fetchRow();

      if (cancelled) return;

      if (error || !row) {
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
        return;
      }

      const g = row as GameRowMin;
      if (!validateStillWaitingHost(g)) {
        clearHostLiveOpenSeatFollow();
        setWatchGameId(null);
        return;
      }
      if (finishIfBlackSeated(g)) {
        return;
      }

      if (cancelled) return;

      const onPayloadNew = (nw: Record<string, unknown>) => {
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
        const nt = normalizeGameTempo(nw.tempo as string | null | undefined);
        const liveish =
          nt === "live" ||
          rowIndicatesLiveFreePlayPacing({
            tempo: nw.tempo as string | null | undefined,
            live_time_control: nw.live_time_control as string | null | undefined,
          });
        const okWaitingHost =
          String(nw.play_context ?? "") === "free" &&
          !nw.tournament_id &&
          liveish &&
          normId(nw.white_player_id) === uid &&
          (st === "active" || st === "waiting");

        if (!okWaitingHost) {
          clearHostLiveOpenSeatFollow();
          setWatchGameId(null);
          removeChannelSafe(chRef);
        }
      };

      const recheck = async () => {
        if (cancelled) return;
        const { data: r2, error: e2 } = await fetchRow();
        if (e2 || !r2) return;
        const gr = r2 as GameRowMin;
        if (finishIfBlackSeated(gr)) {
          return;
        }
        if (!validateStillWaitingHost(gr)) {
          clearHostLiveOpenSeatFollow();
          setWatchGameId(null);
          removeChannelSafe(chRef);
        }
      };

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
            onPayloadNew(payload.new as Record<string, unknown>);
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void recheck();
          }
        });

      if (cancelled) {
        void supabase.removeChannel(ch);
        return;
      }
      chRef.current = ch;
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
      }
      intervalRef.current = window.setInterval(() => {
        void recheck();
      }, HOST_FOLLOW_OPEN_POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      removeChannelSafe(chRef);
    };
  }, [watchGameId, sessionUserId, router]);

  return null;
}
