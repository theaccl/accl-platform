"use client";

import { useEffect } from "react";

import { supabase } from "@/lib/supabaseClient";

/**
 * bfcache can restore /nexus without a network round-trip; session may be gone after logout.
 * Hard-navigate to login if the restored page no longer has a session.
 */
export default function NexusBfcacheAuthGuard() {
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (!data.session) {
          window.location.replace("/login?next=%2Fnexus");
        }
      });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
