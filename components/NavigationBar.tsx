"use client";

import Image from "next/image";
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
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-950/40 ring-1 ring-red-500/50 shadow-[0_0_0_1px_rgba(17,23,35,0.9)]">
      <Image
        src="/accl-mark-v2.png"
        alt="ACCL"
        width={20}
        height={20}
        className="h-5 w-5 object-contain brightness-125 contrast-125"
        priority
      />
    </div>
  );
}

export default function NavigationBar() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setIsLoggedIn(Boolean(data.session?.user?.id));
      setChecked(true);
    };
    void sync();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session?.user?.id));
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
                  <button
                    type="button"
                    onClick={() => router.push("/profile")}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-300 transition-colors hover:bg-[#151d2c] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                  >
                    <AcclMark />
                    <span className="font-medium">Profile</span>
                  </button>
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
