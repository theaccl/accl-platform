import { classifyRatingBucket } from '@/lib/ratingBucketClassify';
import { normalizeGameTempo, type GameTempo } from '@/lib/gameTempo';
import type { SeededParticipant } from '@/lib/tournamentTypes';

export type EntryWithMeta = {
  userId: string;
  /** From `player_ratings.rating` for tournament bucket at this tempo; fallback e.g. 1500 */
  ratingInBucket: number;
  /** `tournament_entries.created_at` or Date.now for tie-break */
  createdAt: Date | string;
};

function createdAtMs(d: Date | string): number {
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Bucket for seeding: tournament × tempo + live_time_control (mirrors `classifyRatingBucket`).
 */
export function tournamentRatingBucketForTempo(
  tempo: GameTempo | string | null | undefined,
  liveTimeControl?: string | null
): string {
  const p = normalizeGameTempo(tempo);
  return classifyRatingBucket('tournament', p, liveTimeControl ?? null) ?? 'tournament_live';
}

/**
 * Deterministic: higher rating first, then earlier `created_at` (smaller ms = better seed among ties).
 */
export function sortEntriesForSeeding(entries: EntryWithMeta[]): EntryWithMeta[] {
  return [...entries].sort((a, b) => {
    if (b.ratingInBucket !== a.ratingInBucket) return b.ratingInBucket - a.ratingInBucket;
    return createdAtMs(a.createdAt) - createdAtMs(b.createdAt);
  });
}

export function toSeededParticipants(sorted: EntryWithMeta[]): SeededParticipant[] {
  return sorted.map((e, i) => ({
    userId: e.userId,
    seed: i + 1,
    ratingUsed: e.ratingInBucket,
    createdAtMs: createdAtMs(e.createdAt),
  }));
}
