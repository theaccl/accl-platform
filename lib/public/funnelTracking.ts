export type GrowthEventType =
  | 'landing_view'
  | 'spectate_open'
  | 'signup_open'
  | 'signup_complete'
  | 'play_open'
  | 'tournament_view'
  | 'share_click';

type Queued = {
  event_type: GrowthEventType;
  entry_source?: string;
  referral_id?: string | null;
  conversion_step?: string;
  ecosystem?: string;
  meta?: Record<string, unknown>;
};

const FLUSH_MS = 4000;
const MAX_QUEUE = 24;

let queue: Queued[] = [];
let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
/** After a non-429 failure, stop sending until a flush succeeds (avoids hammering a broken endpoint). */
let growthFunnelSuspended = false;
let growthBatchRejectedLogged = false;

function scheduleFlush(): void {
  if (typeof window === 'undefined') return;
  if (growthFunnelSuspended) return;
  if (timer != null) return;
  timer = globalThis.setTimeout(() => {
    timer = null;
    void flushGrowthQueue();
  }, FLUSH_MS);
}

async function flushGrowthQueue(): Promise<void> {
  if (growthFunnelSuspended) return;
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_QUEUE);
  queue = [];
  try {
    const res = await fetch('/api/public/growth-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
    if (!res.ok) {
      if (res.status !== 429) {
        growthFunnelSuspended = true;
      }
      if (!growthBatchRejectedLogged && typeof console !== 'undefined') {
        growthBatchRejectedLogged = true;
        console.warn('[growth-funnel] growth-event rejected', res.status, '(client backoff active)');
      }
      return;
    }
    growthBatchRejectedLogged = false;
    growthFunnelSuspended = false;
  } catch {
    queue = [...batch, ...queue].slice(0, MAX_QUEUE);
  }
}

/**
 * Debounced, non-blocking funnel signals — safe to call from UI handlers.
 */
export function trackGrowthEvent(payload: Queued): void {
  if (typeof window === 'undefined') return;
  if (growthFunnelSuspended) return;
  queue.push(payload);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  scheduleFlush();
}

export function trackGrowthEventImmediate(payload: Queued): void {
  if (typeof window === 'undefined') return;
  if (growthFunnelSuspended) return;
  void fetch('/api/public/growth-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [payload] }),
    keepalive: true,
  })
    .then((res) => {
      if (!res.ok) {
        if (res.status !== 429) {
          growthFunnelSuspended = true;
        }
        if (!growthBatchRejectedLogged && typeof console !== 'undefined') {
          growthBatchRejectedLogged = true;
          console.warn('[growth-funnel] growth-event immediate rejected', res.status, '(client backoff active)');
        }
      } else {
        growthBatchRejectedLogged = false;
        growthFunnelSuspended = false;
      }
    })
    .catch(() => {
      queue = [{ ...payload }, ...queue].slice(0, MAX_QUEUE);
    });
}
