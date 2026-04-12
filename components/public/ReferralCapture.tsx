"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { setStoredEntrySource, setStoredReferral } from "@/lib/public/referralTracking";

/**
 * Captures ?ref= and coarse entry attribution (Phase 25–26).
 */
export default function ReferralCapture() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const ref = searchParams.get("ref")?.trim();
    if (ref && ref.length <= 120) {
      setStoredReferral(ref);
    }
  }, [searchParams]);

  useEffect(() => {
    const p = pathname ?? "";
    if (p === "/") setStoredEntrySource("landing");
    else if (p.startsWith("/share")) setStoredEntrySource("share");
    else if (p.startsWith("/game/")) setStoredEntrySource("spectate");
  }, [pathname]);

  return null;
}
