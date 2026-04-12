/**
 * Phase 24 — code-level launch ordering (no admin UI, no runtime mutation of integrity).
 */

import type { NexusGlobalEvent } from "@/lib/events/globalEventBuilder";
import type { ChampionshipTier, LifecycleState } from "@/lib/events/globalEventTypes";

export const DEFAULT_LAUNCH_SEQUENCE = { finaleFirst: true, emphasisHours: 24 } as const;

export function orderGlobalEventsForLaunch(
  events: NexusGlobalEvent[],
  config: typeof DEFAULT_LAUNCH_SEQUENCE = DEFAULT_LAUNCH_SEQUENCE,
): NexusGlobalEvent[] {
  const tierOrder = (t: ChampionshipTier) =>
    t === "finale" ? 0 : t === "semifinal" ? 1 : t === "quarterfinal" ? 2 : 3;
  const lifecycleOrder = (l: LifecycleState) =>
    l === "live" ? 0 : l === "countdown" ? 1 : l === "announce" ? 2 : 3;

  return [...events].sort((a, b) => {
    if (config.finaleFirst) {
      const td = tierOrder(a.championship_tier) - tierOrder(b.championship_tier);
      if (td !== 0) return td;
    }
    const ld = lifecycleOrder(a.lifecycle_state) - lifecycleOrder(b.lifecycle_state);
    if (ld !== 0) return ld;
    if (b.hero_priority !== a.hero_priority) return b.hero_priority - a.hero_priority;
    return b.priority - a.priority;
  });
}
