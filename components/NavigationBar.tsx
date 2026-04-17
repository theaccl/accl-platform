"use client";

import Image from "next/image";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NotificationsNavLink } from "@/components/notifications/NotificationsNavLink";
import { TesterBugReportTrigger } from "@/components/TesterBugReportDialog";
import { useProfileUsername } from "@/hooks/useProfileUsername";
import { usePublicProfileAcclRating } from "@/hooks/usePublicProfileAcclRating";
import { identityPreviewFromUser } from "@/lib/profileIdentity";
import { supabase } from "@/lib/supabaseClient";

const navBtn =
  "text-sm text-gray-300 hover:text-white hover:underline hover:underline-offset-4 hover:decoration-gray-500/60 transition-colors px-2 py-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40";

const navBtnAuth = `${navBtn} font-medium`;

/** Site controls: subtle surface, no underline on hover */
const navBtnSite =
  "text-sm text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-[#1a2231] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500";

function AcclMark() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0a0f16] ring-1 ring-red-500 shadow-[0_0_0_1px_rgba(17,23,35,0.95)]">
      <Image
        src="/accl-mark-v2.png"
        alt="ACCL"
        width={20}
        height={20}
        className="h-5 w-5 object-contain brightness-[1.65] contrast-[1.35]"
        priority
      />
    </div>
  );
}

const profilePanelOpen =
  "pointer-events-none invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100";

function ProfileIdentityAnchor({
  sessionUser,
  profileUsername,
}: {
  sessionUser: User | null;
  profileUsername: string | null;
}) {
  const router = useRouter();
  const prev = identityPreviewFromUser(sessionUser, { profileUsername });
  const eloDisplay = usePublicProfileAcclRating(sessionUser, prev.elo);

  return (
    <div className="group relative z-50">
      <button
        type="button"
        onClick={() => router.push("/profile")}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-300 transition-colors hover:bg-[#151d2c] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
      >
        <AcclMark />
        <span className="font-medium">Profile</span>
      </button>
      <div className={profilePanelOpen}>
        <div
          role="region"
          aria-label="Profile preview"
          className="w-72 rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] p-4 text-white shadow-lg shadow-black/30"
        >
          <div className="mb-4 flex items-start gap-3 border-b border-[#243244]/80 pb-4">
            <AcclMark />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{prev.displayName}</p>
              <p className="text-xs text-gray-500">Public identity</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">ACCL</span>
              <span className="text-sm font-medium tabular-nums text-gray-100">{eloDisplay}</span>
            </div>
            <div>
              <span className="inline-flex rounded-full border border-red-500/45 bg-red-950/35 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-100/95">
                {prev.rank}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#243244]/60 bg-[#0f1420]/60 px-3 py-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Wins</p>
                <p className="text-sm tabular-nums text-gray-200">{prev.wins}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Streak</p>
                <p className="text-sm tabular-nums text-gray-200">{prev.streak}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-3 border-t border-[#243244]/80 pt-4">
            <Link
              href="/profile"
              className="block w-full rounded-lg border border-red-500/35 bg-red-950/20 px-3 py-2 text-left text-sm font-medium text-red-100/95 transition hover:border-red-500/50 hover:bg-red-950/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
            >
              View Profile
              <span className="mt-0.5 block text-xs font-normal text-gray-500">Open full profile</span>
            </Link>
            <button
              type="button"
              className="text-xs text-gray-500 transition hover:text-red-300/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723]"
              onClick={async () => {
                await supabase.auth.signOut();
                if (typeof window !== "undefined") window.location.replace("/");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type NavigationBarVariant = "default" | "nexusShell";

/** `nexusShell`: lighter header chrome on /nexus — same links as default (no duplicate NEXUS nav item). */
const GAME_PATH_RE =
  /^\/game\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export default function NavigationBar({ variant = "default" }: { variant?: NavigationBarVariant }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const shell = variant === "nexusShell";
  const [checked, setChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [lockSiteNavForLiveGame, setLockSiteNavForLiveGame] = useState(false);
  const profileUsername = useProfileUsername(sessionUser);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const u = data.session?.user ?? null;
      setIsLoggedIn(Boolean(u?.id));
      setSessionUser(u);
      setChecked(true);
    };
    void sync();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setIsLoggedIn(Boolean(u?.id));
      setSessionUser(u);
      setChecked(true);
    });
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      void sync();
      router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  useEffect(() => {
    const m = GAME_PATH_RE.exec(pathname);
    if (!m) {
      setLockSiteNavForLiveGame(false);
      return;
    }
    const gameId = m[1];
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("games").select("status").eq("id", gameId).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setLockSiteNavForLiveGame(false);
        return;
      }
      const s = String((data as { status?: string }).status ?? "")
        .trim()
        .toLowerCase();
      setLockSiteNavForLiveGame(s === "active" || s === "waiting");
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <header
      className={
        shell
          ? "mb-0 w-full border-b border-white/[0.06] bg-[#07080c]/90 pb-0 text-white shadow-none backdrop-blur-sm"
          : "mb-0 w-full border-b border-[#243244] bg-[#0D1117]/95 pb-0 text-white shadow-[0_1px_0_0_rgba(36,50,68,0.65)] backdrop-blur-[2px]"
      }
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-0">
        <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-y-2 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
            <nav className="flex shrink-0 items-center gap-3" aria-label="Account">
              {checked ? (
                isLoggedIn ? (
                  <ProfileIdentityAnchor sessionUser={sessionUser} profileUsername={profileUsername} />
                ) : (
                  <>
                    <button type="button" onClick={() => router.push("/login")} className={navBtnAuth}>
                      Log In
                    </button>
                    <button type="button" onClick={() => router.push("/login?intent=signup")} className={navBtnAuth}>
                      Sign Up
                    </button>
                  </>
                )
              ) : (
                <span className="text-sm text-gray-400">…</span>
              )}
            </nav>
            {checked && isLoggedIn ? (
              <nav
                className="flex max-w-full min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-x-2.5"
                aria-label="Primary navigation"
              >
                <Link href="/players" className={navBtn}>
                  Player lookup
                </Link>
                <TesterBugReportTrigger className={`${navBtn} text-amber-200/90`} label="Report" />
              </nav>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
            {checked && isLoggedIn ? (
              <>
                <Link
                  href="/friends"
                  className={`${navBtnSite} whitespace-nowrap`}
                  data-testid="nav-friends-link"
                >
                  Friends
                </Link>
                <NotificationsNavLink />
                <Link href="/tester/messages" className={`${navBtnSite} whitespace-nowrap`}>
                  Mailbox
                </Link>
              </>
            ) : null}
            <nav className="flex items-center gap-2 sm:gap-3" aria-label="Site">
              <button
                type="button"
                data-testid="site-nav-back"
                disabled={lockSiteNavForLiveGame}
                title={
                  lockSiteNavForLiveGame
                    ? "Back is unavailable while this game is in progress."
                    : undefined
                }
                onClick={() => {
                  if (lockSiteNavForLiveGame) return;
                  router.back();
                }}
                className={navBtnSite}
              >
                Back
              </button>
              <button
                type="button"
                data-testid="site-nav-home"
                disabled={lockSiteNavForLiveGame}
                title={
                  lockSiteNavForLiveGame
                    ? "Home is unavailable while this game is in progress."
                    : undefined
                }
                onClick={() => {
                  if (lockSiteNavForLiveGame) return;
                  router.push("/");
                }}
                className={navBtnSite}
              >
                Home
              </button>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
