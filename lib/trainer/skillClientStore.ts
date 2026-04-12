"use client";

import type { LocalTrainerRollup } from "@/lib/trainer/skillAggregation";

const KEY = "accl_skill_rollup_v1";

export function loadTrainerRollup(userId: string): LocalTrainerRollup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return null;
    const p = JSON.parse(raw) as LocalTrainerRollup;
    if (p?.version !== 1 || p.user_id !== userId) return null;
    return p;
  } catch {
    return null;
  }
}

export function saveTrainerRollup(rollup: LocalTrainerRollup): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${KEY}:${rollup.user_id}`, JSON.stringify(rollup));
  } catch {
    /* quota */
  }
}
