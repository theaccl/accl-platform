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

function scheduleFlush(): void {
  if (typeof window === 'undefined') return;
  if (timer != null) return;
  timer = globalThis.setTimeout(() => {
    timer = null;
    void flushGrowthQueue();
  }, FLUSH_MS);
}

async function flushGrowthQueue(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_QUEUE);
  queue = [];
  try {
    await fetch('/api/public/growth-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch {
    queue = [...batch, ...queue].slice(0, MAX_QUEUE);
  }
}

/**
 * Debounced, non-blocking funnel signals — safe to call from UI handlers.
 */
export function trackGrowthEvent(payload: Queued): void {
  if (typeof window === 'undefined') return;
  queue.push(payload);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  scheduleFlush();
}

export function trackGrowthEventImmediate(payload: Queued): void {
  if (typeof window === 'undefined') return;
  void fetch('/api/public/growth-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [payload] }),
    keepalive: true,
  }).catch(() => {});
}
