"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { acclPerfMark } from "@/lib/acclPerfDebug";
import { navigateAfterAcceptIfAllowed } from "@/lib/postAcceptGameNavigation";

/** Free-play games created from challenge / open listing / rematch request — not tournaments or bots. */
const REDIRECT_SOURCE_TYPES = new Set(["challenge", "open_listing", "rematch_request"]);

/**
 * When an opponent accepts a direct challenge, the accepter navigates in `app/requests/page.tsx`.
 * The sender often has no mounted `DirectChallengePanel` subscription (e.g. left Free play).
 * Listen globally for the resulting `games` row and/or `match_requests` resolution so the sender
 * lands on the same `/game/:id` without manual refresh.
 */
export function SenderChallengeGameRedirectListener() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const pathnameRef = useRef(pathname);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const lastPushRef = useRef<{ gameId: string; at: number } | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
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

  useEffect(() => {
    if (!sessionUserId) {
      return;
    }
    const uid = sessionUserId;

    const tryNavigateToGame = async (gameId: string, acceptedTempo: string | null | undefined) => {
      const g = gameId.trim();
      if (!g) {
        return;
      }
      const path = pathnameRef.current;
      if (path === `/game/${g}` || path.startsWith(`/game/${g}?`)) {
        return;
      }
      const now = Date.now();
      const prev = lastPushRef.current;
      if (prev && prev.gameId === g && now - prev.at < 2500) {
        return;
      }
      const didPush = await navigateAfterAcceptIfAllowed({
        flow: "sender-challenge-game-redirect-listener",
        pathname: path,
        router,
        supabase,
        authUserId: uid,
        acceptedGameId: g,
        acceptedTempoHint: acceptedTempo ?? null,
        boardGameFromPage: null,
      });
      if (didPush) {
        lastPushRef.current = { gameId: g, at: Date.now() };
      }
    };

    const shouldRedirectOnGameInsert = (row: Record<string, unknown>): boolean => {
      if (String(row.play_context ?? "") !== "free") {
        return false;
      }
      if (row.tournament_id) {
        return false;
      }
      const st = String(row.source_type ?? "");
      if (!REDIRECT_SOURCE_TYPES.has(st)) {
        return false;
      }
      const w = String(row.white_player_id ?? "");
      const b = String(row.black_player_id ?? "");
      if (!w || !b) {
        return false;
      }
      return w === uid || b === uid;
    };

    const channel = supabase.channel(`sender-challenge-followup-${uid}`);

    const onGameInsert = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new;
      if (!shouldRedirectOnGameInsert(row)) {
        return;
      }
      const id = String(row.id ?? "").trim();
      if (!id) {
        return;
      }
      void tryNavigateToGame(id, String(row.tempo ?? ""));
    };

    const onOutgoingRequestResolved = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new;
      if (String(row.from_user_id ?? "") !== uid) {
        return;
      }
      if (String(row.status ?? "") !== "accepted") {
        return;
      }
      const gid = String(row.resolution_game_id ?? "").trim();
      if (!gid) {
        return;
      }
      void tryNavigateToGame(gid, String(row.tempo ?? ""));
    };

    acclPerfMark("SenderChallengeGameRedirectListener.realtime.subscribe", { uid });
    /**
     * Intentionally **no** `games` UPDATE listeners here: filtering `white_player_id=eq.uid` / `black_player_id=eq.uid`
     * receives every move/update on active boards (very high volume) and was a major production perf cost.
     * Open-seat host auto-follow after join: `HostLiveOpenSeatFollowListener` (`games` UPDATE, `id=eq.<gameId>` only).
     */
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "games", filter: `white_player_id=eq.${uid}` },
        (p) => onGameInsert(p as { new: Record<string, unknown> }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "games", filter: `black_player_id=eq.${uid}` },
        (p) => onGameInsert(p as { new: Record<string, unknown> }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "match_requests", filter: `from_user_id=eq.${uid}` },
        (p) => onOutgoingRequestResolved(p as { new: Record<string, unknown> }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionUserId, router]);

  return null;
}
