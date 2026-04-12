"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NexusPersonalHook } from "@/lib/nexus/getNexusData";

const STORAGE_KEY = "nexus_onboarding_dismissed_v1";

function isMinimalActivity(hook: NexusPersonalHook) {
  if (hook.tier === "Unranked" && hook.total_earned === 0) return true;
  if (hook.rank === null) return true;
  if (hook.rank > 48) return true;
  if (hook.total_earned < 15 && hook.rank > 18) return true;
  return false;
}

export default function OnboardingPanel({
  hook,
  userId,
  k12,
}: {
  hook: NexusPersonalHook;
  userId: string | null;
  k12: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) {
        setVisible(false);
        return;
      }
    } catch {
      /* ignore */
    }
    if (!userId) {
      setVisible(true);
      return;
    }
    setVisible(isMinimalActivity(hook));
  }, [userId, hook]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!mounted || !visible) return null;

  const title = k12 ? "Welcome to Nexus" : "Welcome to ACCL Nexus";
  const lead = k12
    ? "Live games, tournaments, and your progress — in one calm view."
    : "Live games, tournaments, and progression — see what is running and what is next for you.";

  return (
    <section
      className={`rounded-2xl border p-4 shadow-[0_8px_24px_rgba(0,0,0,0.2)] ${
        k12 ? "border-[#2a4564] bg-[#102033]" : "border-[#2a3442] bg-[#111723]"
      }`}
      aria-label="Nexus onboarding"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className={`text-xs uppercase tracking-widest ${k12 ? "text-cyan-200/80" : "text-gray-400"}`}>Start here</p>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-sm text-gray-300 max-w-xl">{lead}</p>
          <ul className="mt-2 text-xs text-gray-400 space-y-1 list-disc list-inside">
            <li>Live games — watch boards as they happen</li>
            <li>Tournaments — structured play and brackets</li>
            <li>Progression — standings, tiers, and momentum</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border transition ${
            k12
              ? "border-cyan-500/40 text-cyan-100 hover:bg-cyan-900/20"
              : "border-[#3d4a5c] text-gray-300 hover:bg-white/5"
          }`}
        >
          Dismiss
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/free/play"
          className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white transition ${
            k12 ? "bg-cyan-700 hover:bg-cyan-600" : "bg-red-700 hover:bg-red-600"
          }`}
        >
          {k12 ? "Play a game" : "Play Free Game"}
        </Link>
        <Link
          href="/tournaments/join"
          className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium border transition ${
            k12
              ? "border-cyan-500/50 text-cyan-100 hover:bg-cyan-900/20"
              : "border-red-500/40 text-red-100 hover:bg-red-900/20"
          }`}
        >
          Join Tournament
        </Link>
        <Link
          href="/nexus#quick-nav"
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium border border-[#3d4a5c] text-gray-200 hover:bg-white/5"
        >
          Explore Nexus
        </Link>
      </div>
    </section>
  );
}
