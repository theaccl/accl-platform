"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import NavigationBar from "@/components/NavigationBar";
import PlayerNexusInsightsPanel from "@/components/PlayerNexusInsightsPanel";
import ProfileLogOutButton from "@/components/profile/ProfileLogOutButton";
import { ProfileUsernameCallout } from "@/components/profile/ProfileUsernameCallout";
import { useProfileUsername } from "@/hooks/useProfileUsername";
import { identityPreviewFromUser, publicIdentityFromProfileUsername } from "@/lib/profileIdentity";
import { supabase } from "@/lib/supabaseClient";

const nexusCard =
  "rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] shadow-lg shadow-black/25";

const statLabel = "text-xs font-medium uppercase tracking-wide text-gray-500";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);

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

  const profileUsername = useProfileUsername(user);
  const prev = identityPreviewFromUser(user, { profileUsername });

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />

      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
        <div className="flex w-full shrink-0 justify-end">
          <ProfileLogOutButton />
        </div>

        <ProfileUsernameCallout username={profileUsername} accountEmail={user?.email ?? null} />

        {/* Main identity card — Nexus-style */}
        <section className={`${nexusCard} p-6 sm:p-8`}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex justify-center sm:justify-start">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[#0f1722] ring-1 ring-red-500/70 shadow-[0_0_0_1px_rgba(17,23,35,0.9)]">
                <Image
                  src="/accl-mark-v2.png"
                  alt="ACCL"
                  width={64}
                  height={64}
                  className="h-16 w-16 object-contain brightness-150 contrast-150"
                  priority
                />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
              <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">Public identity</p>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {publicIdentityFromProfileUsername(profileUsername, null)}
              </h1>
              <p className="text-xs text-gray-500">Same username as in the Username card above — not email.</p>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="rounded-lg border border-[#2a3442] bg-[#151d2c] px-3 py-1.5 text-sm text-gray-200">
                  <span className="text-gray-500">ACCL </span>
                  <span className="font-semibold text-white tabular-nums">{prev.elo}</span>
                </span>
                <span className="rounded-full border border-red-500/45 bg-red-950/35 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-100/95">
                  {prev.rank}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Quick stats */}
        <section className={`${nexusCard} p-6`}>
          <h2 className="mb-4 text-sm font-semibold text-white">Quick stats</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#2a3442] bg-[#0f1420]/80 px-3 py-3 text-center">
              <p className={statLabel}>Games</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-gray-100">{prev.gamesPlayed}</p>
            </div>
            <div className="rounded-xl border border-[#2a3442] bg-[#0f1420]/80 px-3 py-3 text-center">
              <p className={statLabel}>Wins</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-gray-100">{prev.wins}</p>
            </div>
            <div className="rounded-xl border border-[#2a3442] bg-[#0f1420]/80 px-3 py-3 text-center">
              <p className={statLabel}>Streak</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-gray-100">{prev.streak}</p>
            </div>
          </div>
        </section>

        <PlayerNexusInsightsPanel />

        <div className="flex flex-col gap-4">
          <Link
            href="/account"
            className="w-full rounded-xl border border-[#2a3442] bg-[#101722] py-4 text-center text-base font-semibold text-gray-100 transition hover:bg-[#192235]"
          >
            Manage account
          </Link>
          <Link
            href="/vault"
            className="w-full rounded-xl bg-[#161b22] py-4 text-center text-lg font-semibold transition hover:bg-[#21262d]"
          >
            Enter vault
          </Link>

          <Link
            href="/trainer/review"
            className="w-full rounded-xl bg-[#161b22] py-4 text-center text-lg font-semibold transition hover:bg-[#21262d]"
          >
            Review finished games
          </Link>

          <Link
            href="/trainer"
            className="w-full rounded-xl bg-[#161b22] py-4 text-center text-lg font-semibold transition hover:bg-[#21262d]"
          >
            Open Trainer
          </Link>
        </div>

        <div className="border-t border-gray-800 pt-4">
          <button type="button" className="text-sm text-gray-400 transition hover:text-white">
            Guardian / Student Setup
          </button>
        </div>
      </div>
    </div>
  );
}
