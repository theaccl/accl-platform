"use client";

import { supabase } from "@/lib/supabaseClient";

/** Primary sign-out control on /profile (removed from global NavigationBar). */
export default function ProfileLogOutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await supabase.auth.signOut();
        if (typeof window !== "undefined") {
          window.location.replace("/");
        }
      }}
      className="rounded-lg border border-[#2a3442] bg-[#151d2c] px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-red-500/35 hover:bg-[#1a2435] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
    >
      Log Out
    </button>
  );
}
