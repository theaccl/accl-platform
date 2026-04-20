import type { PublicP1Read } from '@/lib/p1PublicRatingRead';

/**
 * Mean of available mode ratings from a flat row shape.
 * Uses truthy filter (matches classic ELO rows; 0 is treated as missing).
 */
export function computeOverallElo(p: any): number | null {
  const vals = [
    p?.bullet_elo,
    p?.blitz_elo,
    p?.rapid_elo,
    p?.daily_elo,
    p?.tournament_elo,
  ].filter(Boolean) as number[];

  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Overall ELO from P1 public read (bullet/blitz/rapid/daily/tournament unified). */
export function overallEloFromP1(p1: PublicP1Read | null | undefined): number | null {
  if (!p1) return null;
  return computeOverallElo({
    bullet_elo: p1.free_bullet?.rating ?? null,
    blitz_elo: p1.free_blitz?.rating ?? null,
    rapid_elo: p1.free_rapid?.rating ?? null,
    daily_elo: p1.free_day?.rating ?? null,
    tournament_elo: p1.tournament_unified?.rating ?? p1.accl_rating ?? null,
  });
}

export function isUserOnline(lastActiveAt: string | null) {
  if (!lastActiveAt) return false;
  const diff = Date.now() - new Date(lastActiveAt).getTime();
  return diff < 5 * 60 * 1000;
}

/** Short relative time for "Last seen …" on profiles (UTC-neutral phrasing). */
export function formatLastSeenAgo(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function countWords(value: string | null | undefined): number {
  const text = (value ?? '').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

/** Canonical user-facing copy (matches RPC `raise exception 'Bio must be 150–250 words'` mapping in UI). */
export const PROFILE_BIO_WORD_ERROR_MESSAGE = 'Bio must be 150–250 words.';

export function assertBioWordCount(value: string | null | undefined, min = 150, max = 250): void {
  const words = countWords(value);

  if (words < min || words > max) {
    if (min === 150 && max === 250) {
      throw new Error(PROFILE_BIO_WORD_ERROR_MESSAGE);
    }
    throw new Error(`Bio must be ${min}–${max} words.`);
  }
}
