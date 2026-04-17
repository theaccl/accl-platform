"use client";

import type { ReactNode } from "react";
import { useState } from "react";

/**
 * Collapsible rankings wrapper — default collapsed on narrow viewports (P3 UI-only).
 */
export default function NexusRankingsCollapsible({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0c0e12]" data-testid="nexus-rankings-collapsible">
      <button
        type="button"
        className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-t-2xl px-4 py-3.5 text-left text-sm font-semibold text-gray-100 transition-colors duration-150 hover:bg-white/[0.05] active:bg-white/[0.08] motion-safe:active:scale-[0.998] lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500/45"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="nexus-rankings-toggle"
      >
        <span>Rankings</span>
        <span className="tabular-nums text-gray-500" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      <div
        className={`${open ? "block" : "hidden"} border-t border-white/[0.06] px-3 pb-4 pt-2 sm:px-4 lg:block lg:border-0 lg:px-0 lg:pb-0 lg:pt-0`}
      >
        {children}
      </div>
    </div>
  );
}
