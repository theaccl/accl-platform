"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const navBtn =
  "text-sm text-gray-200 hover:text-white transition-colors rounded-md px-0 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]";

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
    <header className="w-full shrink-0 border-b border-[#243244] bg-[#0D1117]">
      <div className="mx-auto flex h-[52px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <nav className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4" aria-label="Account">
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
            <span className="text-sm text-gray-500">…</span>
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
    </header>
  );
}
