import {
  liveTimeoutSweepConfigInvalidJson,
  liveTimeoutSweepUnauthorizedJson,
  verifyLiveTimeoutSweepSecret,
} from '@/lib/internalLiveClockTimeoutAuth';
import { getLiveTimeoutSweepSecretValidationState } from '@/lib/runtimeConfigValidation';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

const MAX_ROUNDS = 8;
const DEFAULT_BATCH = 25;

/**
 * POST: run expire_live_clock_timeouts in bounded rounds (service role only).
 * Auth: x-accl-live-timeout-sweep-secret (or ACCL_ANALYSIS_QUEUE_SECRET fallback).
 */
export async function POST(request: Request): Promise<Response> {
  if (!getLiveTimeoutSweepSecretValidationState().ok) {
    return liveTimeoutSweepConfigInvalidJson();
  }
  if (!verifyLiveTimeoutSweepSecret(request)) {
    return liveTimeoutSweepUnauthorizedJson();
  }

  let batch = DEFAULT_BATCH;
  try {
    const body = (await request.json()) as { batch?: unknown } | null;
    const n = typeof body?.batch === 'number' ? body.batch : parseInt(String(body?.batch ?? DEFAULT_BATCH), 10);
    batch = Math.min(500, Math.max(1, Number.isFinite(n) ? n : DEFAULT_BATCH));
  } catch {
    batch = DEFAULT_BATCH;
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  }

  let finished = 0;
  let rounds = 0;

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const { data, error } = await supabase.rpc('expire_live_clock_timeouts', { p_batch: batch });
    if (error) {
      return new Response(
        JSON.stringify({ error: error.message, finished, rounds }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
        },
      );
    }

    const n = typeof data === 'number' ? data : parseInt(String(data ?? '0'), 10);
    const count = Number.isFinite(n) ? Math.max(0, n) : 0;
    finished += count;
    rounds += 1;

    if (count === 0) {
      break;
    }
  }

  return new Response(JSON.stringify({ finished, rounds }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}
