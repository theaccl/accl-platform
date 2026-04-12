/**
 * Lightweight fixed-window rate limiter (in-memory, per Node instance).
 * For multi-instance production, add Redis/edge limits later if needed.
 */
type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 50_000;

function pruneIfNeeded() {
  if (buckets.size <= MAX_BUCKETS) return;
  const keys = [...buckets.keys()].slice(0, Math.floor(MAX_BUCKETS / 2));
  for (const k of keys) buckets.delete(k);
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSec: number };

/**
 * @param key Stable key per actor (e.g. `submit-move:${userId}`)
 * @param max Max requests per window
 * @param windowMs Window length in ms
 */
export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  pruneIfNeeded();
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (b.count >= max) {
    const retryAfterMs = b.windowStart + windowMs - now;
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  b.count += 1;
  return { allowed: true };
}
