"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import {
  formatRatingDisplay,
  parseP1FromSnapshotPayload,
  type PublicP1Read,
} from "@/lib/p1PublicRatingRead";
import { supabase } from "@/lib/supabaseClient";
import { nexusPrestigeCard } from "@/components/nexus/nexusShellTheme";
import { nexusModuleHeadingClass } from "@/components/nexus/NexusHeader";

function rowLabel(r: { rating: number; games_played: number } | null | undefined): string {
  if (!r || typeof r.rating !== "number") return "—";
  return `${formatRatingDisplay(r.rating)} · ${r.games_played} gp`;
}

/**
 * P1 snapshot from existing RPC — display only; no rating logic changes.
 */
export default function NexusPlayerSnapshotCard() {
  const [user, setUser] = useState<User | null>(null);
  const [p1, setP1] = useState<PublicP1Read | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const uid = user?.id?.trim();
    if (!uid) {
      setP1(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("get_public_profile_snapshot", {
        p_profile_id: uid,
      });
      if (cancelled || error) return;
      setP1(parseP1FromSnapshotPayload(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <section
      className={`${nexusPrestigeCard} p-4 shadow-lg shadow-black/30 sm:p-5 md:p-6`}
      aria-label="Player ratings snapshot"
      data-testid="nexus-player-snapshot"
    >
      <h2 className={`${nexusModuleHeadingClass} mb-1`}>Ratings snapshot</h2>
      {!user?.id ? (
        <p className="mt-3 text-sm leading-relaxed text-gray-500">Sign in to load snapshot.</p>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="rounded-xl border border-red-900/35 bg-gradient-to-br from-red-950/35 to-[#0a0c10] px-4 py-4 shadow-inner shadow-black/40 sm:px-5 sm:py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-200/80">ACCL rating</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white sm:text-[2rem]">
              {formatRatingDisplay(p1?.accl_rating ?? null)}
            </p>
            <p className="mt-3 text-xs text-gray-500">Primary identity for matchmaking and standings.</p>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Tournament</span>
            <span className="text-right text-base tabular-nums text-gray-200">
              {formatRatingDisplay(p1?.tournament_rating ?? p1?.tournament_unified?.rating ?? null)}
            </span>
          </div>

          <div>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-gray-600">Free play modes</p>
            <dl className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-white/[0.05] bg-[#080a0e]/80 px-3 py-3 sm:grid-cols-2 sm:gap-x-6 sm:px-4">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-xs font-medium text-gray-500">Bullet</dt>
                <dd className="text-right text-sm tabular-nums text-gray-300 sm:text-[0.9375rem]">
                  {rowLabel(p1?.free_bullet)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-xs font-medium text-gray-500">Blitz</dt>
                <dd className="text-right text-sm tabular-nums text-gray-300 sm:text-[0.9375rem]">
                  {rowLabel(p1?.free_blitz)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-xs font-medium text-gray-500">Rapid</dt>
                <dd className="text-right text-sm tabular-nums text-gray-300 sm:text-[0.9375rem]">
                  {rowLabel(p1?.free_rapid)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-xs font-medium text-gray-500">Daily</dt>
                <dd className="text-right text-sm tabular-nums text-gray-300 sm:text-[0.9375rem]">
                  {rowLabel(p1?.free_day)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
