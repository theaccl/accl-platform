import type { NexusData, NexusEcosystem } from "@/lib/nexus/getNexusData";

type Entry = { data: NexusData; at: number };

const store = new Map<string, Entry>();

/** Per ecosystem + user (personal_hook is user-specific). */
export function nexusOverviewCacheKey(ecosystem: NexusEcosystem, userId: string | null): string {
  return `${ecosystem}:${userId ?? "anon"}`;
}

export function getCachedNexusOverview(key: string, maxAgeMs: number): NexusData | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() - e.at > maxAgeMs) return null;
  return e.data;
}

const MAX_ENTRIES = 48;

export function setCachedNexusOverview(key: string, data: NexusData): void {
  store.set(key, { data, at: Date.now() });
  while (store.size > MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of store) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) store.delete(oldestKey);
    else break;
  }
}
