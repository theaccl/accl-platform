"use client";

import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const navBtn =
  "text-sm text-gray-300 hover:text-white hover:underline hover:underline-offset-4 hover:decoration-gray-500/60 transition-colors px-2 py-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40";

const navBtnAuth =
  `${navBtn} font-medium`;

/** Site controls: subtle surface, no underline on hover */
const navBtnSite =
  "text-sm text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-[#1a2231] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40";

function AcclMark() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0f1722] ring-1 ring-red-500/60 shadow-[0_0_0_1px_rgba(17,23,35,0.9)]">
      <Image
        src="/accl-mark-v2.png"
        alt="ACCL"
        width={20}
        height={20}
        className="h-5 w-5 object-contain brightness-150 contrast-150"
        priority
      />
    </div>
  );
}

function pickMeta(meta: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = meta[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

/** Session / user_metadata only — no extra API calls. */
function identityPreviewFromUser(user: User | null) {
  if (!user) {
    return {
      displayName: "—",
      rank: "—",
      rating: "—",
      record: "—",
    };
  }
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    pickMeta(meta, ["full_name", "name", "username", "display_name", "preferred_username"]) ??
    user.email?.split("@")[0] ??
    "—";
  const rank = pickMeta(meta, ["rank", "tier", "accl_rank", "accl_tier"]) ?? "—";
  const rating = pickMeta(meta, ["rating", "elo", "accl_rating", "accl_elo"]) ?? "—";
  let record = "—";
  const wins = meta.wins;
  const losses = meta.losses;
  if (typeof wins === "number" && typeof losses === "number") {
    record = `${wins}–${losses}`;
  } else if (meta.streak != null && String(meta.streak).trim() !== "") {
    record = `Streak ${meta.streak}`;
  } else if (pickMeta(meta, ["record", "win_loss", "wl"])) {
    record = pickMeta(meta, ["record", "win_loss", "wl"])!;
  }
  return { displayName, rank, rating, record };
}

const profilePanelOpen =
  "pointer-events-none invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100";

function ProfileIdentityAnchor({ sessionUser }: { sessionUser: User | null }) {
  const router = useRouter();
  const prev = identityPreviewFromUser(sessionUser);

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
              <p className="text-sm font-semibold text-white">Profile</p>
              <p className="text-xs text-gray-500">ACCL Identity</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Display name</p>
              <p className="truncate text-sm text-gray-200">{prev.displayName}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Rank</p>
                <p className="text-sm text-gray-200">{prev.rank}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Rating</p>
                <p className="text-sm text-gray-200">{prev.rating}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Record</p>
                <p className="text-sm text-gray-200">{prev.record}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-[#243244]/80 pt-4">
            <button
              type="button"
              onClick={() => router.push("/profile")}
              className="w-full rounded-lg border border-red-500/35 bg-red-950/20 px-3 py-2 text-left text-sm font-medium text-red-100/95 transition hover:border-red-500/50 hover:bg-red-950/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
            >
              View Profile
              <span className="mt-0.5 block text-xs font-normal text-gray-500">Open full profile</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NavigationBar() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);

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

  return (
    <header className="mb-0 w-full border-b border-[#243244] bg-[#0D1117]/95 pb-0 text-white shadow-[0_1px_0_0_rgba(36,50,68,0.65)] backdrop-blur-[2px]">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-0">
        <div className="flex h-[52px] items-center justify-between">
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-4" aria-label="Account">
              {checked ? (
                isLoggedIn ? (
                  <ProfileIdentityAnchor sessionUser={sessionUser} />
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
          </div>

          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-3" aria-label="Site">
              <button type="button" onClick={() => router.back()} className={navBtnSite}>
                Back
              </button>
              <button type="button" onClick={() => router.push("/")} className={navBtnSite}>
                Home
              </button>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
