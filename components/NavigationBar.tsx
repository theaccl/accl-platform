"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/** Explicit colors + bg so links stay visible on `#0D1117` and are not clipped by parent overflow. */
const navBtn =
  "text-sm font-medium text-gray-100 hover:text-white bg-transparent rounded-md px-0 py-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]";

export default function NavigationBar() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setIsLoggedIn(Boolean(data.session?.user?.id));
      setChecked(true);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session?.user?.id));
      setChecked(true);
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    router.replace("/");
    router.refresh();
  };

  return (
    <header className="relative z-50 w-full min-w-0 shrink-0 border-b border-[#243244] bg-[#0D1117] text-white">
      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6">
        <div className="flex min-h-[52px] w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 sm:h-[52px] sm:flex-nowrap sm:py-0">
          <nav className="flex min-w-0 items-center gap-3 sm:gap-4" aria-label="Account">
            {checked ? (
              isLoggedIn ? (
                <>
                  <button type="button" onClick={() => router.push("/profile")} className={navBtn}>
                    Profile
                  </button>
                  <button type="button" onClick={() => void logout()} className={navBtn}>
                    Log Out
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => router.push("/login")} className={navBtn}>
                    Log In
                  </button>
                  <button type="button" onClick={() => router.push("/login?intent=signup")} className={navBtn}>
                    Sign Up
                  </button>
                </>
              )
            ) : (
              <span className="text-sm text-gray-400">…</span>
            )}
          </nav>

          <nav className="flex shrink-0 items-center gap-3 sm:gap-4" aria-label="Site">
            <button type="button" onClick={() => router.push("/")} className={navBtn}>
              Home
            </button>
            <button type="button" onClick={() => router.back()} className={navBtn}>
              Back
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
