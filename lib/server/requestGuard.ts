/**
 * Phase 29 — lightweight load protection: burst limits + global in-flight cap + per-route rate limits.
 * Does not change business outcomes — only rejects excess traffic with 429.
 */
import { getClientIp } from '@/lib/server/clientIp';
import { checkRateLimit, type RateLimitResult } from '@/lib/server/rateLimit';
import { tooManyRequests } from '@/lib/server/httpJson';

export type GuardRouteKey =
  | 'nexus_overview'
  | 'nexus_public'
  | 'submit_move'
  | 'payments'
  | 'payments_webhook'
  | 'tournaments';

type RouteLimits = {
  /** Fixed-window max per IP per windowMs */
  maxPerWindow: number;
  windowMs: number;
  /** Short burst window (stricter) */
  burstMax: number;
  burstWindowMs: number;
};

const ROUTES: Record<GuardRouteKey, RouteLimits> = {
  nexus_overview: { maxPerWindow: 400, windowMs: 60_000, burstMax: 80, burstWindowMs: 10_000 },
  nexus_public: { maxPerWindow: 120, windowMs: 60_000, burstMax: 40, burstWindowMs: 10_000 },
  submit_move: { maxPerWindow: 180, windowMs: 60_000, burstMax: 45, burstWindowMs: 10_000 },
  payments: { maxPerWindow: 60, windowMs: 60_000, burstMax: 20, burstWindowMs: 10_000 },
  payments_webhook: { maxPerWindow: 3000, windowMs: 60_000, burstMax: 400, burstWindowMs: 10_000 },
  tournaments: { maxPerWindow: 80, windowMs: 60_000, burstMax: 25, burstWindowMs: 10_000 },
};

let globalInFlight = 0;

function maxGlobalConcurrent(): number {
  const raw = process.env.ACCL_MAX_CONCURRENT_REQUESTS?.trim();
  const n = raw ? parseInt(raw, 10) : 800;
  return Number.isFinite(n) && n >= 10 ? n : 800;
}

export type GuardOutcome =
  | { ok: true; release: () => void }
  | { ok: false; response: Response };

/**
 * Acquire guard for a request. Caller MUST call `release()` in `finally` when `ok` is true.
 */
export function guardRequest(request: Request, route: GuardRouteKey): GuardOutcome {
  const ip = getClientIp(request);
  const cfg = ROUTES[route];

  const burst = checkRateLimit(`guard-burst:${route}:${ip}`, cfg.burstMax, cfg.burstWindowMs);
  if (!burst.allowed) {
    return { ok: false, response: tooManyRequests(burst.retryAfterSec) };
  }

  const win = checkRateLimit(`guard:${route}:${ip}`, cfg.maxPerWindow, cfg.windowMs);
  if (!win.allowed) {
    return { ok: false, response: tooManyRequests(win.retryAfterSec) };
  }

  const max = maxGlobalConcurrent();
  if (globalInFlight >= max) {
    return { ok: false, response: tooManyRequests(3) };
  }
  globalInFlight += 1;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      globalInFlight = Math.max(0, globalInFlight - 1);
    },
  };
}

/** Re-export for routes that only need rate-limit tuning (no global slot). */
export function checkRouteRateLimit(route: GuardRouteKey, ip: string): RateLimitResult {
  const cfg = ROUTES[route];
  return checkRateLimit(`guard:${route}:${ip}`, cfg.maxPerWindow, cfg.windowMs);
}
