"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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
    <div className="w-full flex justify-between items-center p-4">
      {/* Auth-aware Left Side */}
      {checked ? (
        isLoggedIn ? (
          <button onClick={() => router.push("/profile")} className="text-white text-sm">
            👤 Profile
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => router.push("/login")} className="text-white text-sm">
              Log In
            </button>
            <button onClick={() => router.push("/login?intent=signup")} className="text-white text-sm">
              Sign Up
            </button>
          </div>
        )
      ) : (
        <span className="text-gray-400 text-sm">...</span>
      )}

      {/* Right Side */}
      <div className="flex gap-3">
        {checked && isLoggedIn ? (
          <button onClick={() => void logout()} className="text-white text-sm">
            Log Out
          </button>
        ) : null}
        <button onClick={() => router.back()} className="text-white text-sm">
          Back
        </button>

        <button onClick={() => router.push("/")} className="text-white text-sm">
          Home
        </button>
      </div>
    </div>
  );
}
