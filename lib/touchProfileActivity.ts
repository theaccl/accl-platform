import type { SupabaseClient } from '@supabase/supabase-js';

let lastTouchMs = 0;

/**
 * Throttled heartbeat so navigation does not spam `touch_profile_activity`.
 */
export function touchProfileActivityThrottled(
  supabase: SupabaseClient,
  minIntervalMs = 120_000,
): void {
  const now = Date.now();
  if (now - lastTouchMs < minIntervalMs) return;
  lastTouchMs = now;
  void supabase.rpc('touch_profile_activity');
}
