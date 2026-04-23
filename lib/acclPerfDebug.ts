/**
 * Opt-in client performance logging (production-safe default: off).
 *
 * Enable in browser: `localStorage.setItem('accl_debug_perf','1')` then reload.
 * Or set `NEXT_PUBLIC_ACCL_DEBUG_PERF=1` (rebuild required).
 */

export function acclPerfDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NEXT_PUBLIC_ACCL_DEBUG_PERF === '1') return true;
  return window.localStorage?.getItem('accl_debug_perf') === '1';
}

export function acclPerfMark(label: string, detail?: Record<string, unknown>): void {
  if (!acclPerfDebugEnabled()) return;
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(`[ACCL_PERF] ${label}`, { ms: Math.round(performance.now()), ...detail });
  }
}

/** Returns an `end()` function that logs elapsed ms since `start()`. */
export function acclPerfTime(label: string): { end: (extra?: Record<string, unknown>) => void } {
  if (!acclPerfDebugEnabled()) {
    return { end: () => {} };
  }
  const t0 = performance.now();
  return {
    end: (extra?: Record<string, unknown>) => {
      const ms = Math.round(performance.now() - t0);
      if (typeof console !== 'undefined' && typeof console.info === 'function') {
        console.info(`[ACCL_PERF] ${label} (done)`, { ms, ...extra });
      }
    },
  };
}
