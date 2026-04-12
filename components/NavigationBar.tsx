"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const navBtn =
  "text-sm text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40";

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

  const logout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    if (typeof window !== "undefined") {
      window.location.replace("/");
    }
  };

  return (
    <header className="w-full border-b border-[#243244] bg-[#0D1117] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex h-[56px] items-center justify-between">
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-4" aria-label="Account">
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
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-4" aria-label="Site">
              <button type="button" onClick={() => router.back()} className={navBtn}>
                Back
              </button>
              <button type="button" onClick={() => router.push("/")} className={navBtn}>
                Home
              </button>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
