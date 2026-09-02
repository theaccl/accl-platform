import {
  liveTimeoutSweepConfigInvalidJson,
  liveTimeoutSweepUnauthorizedJson,
  verifyLiveTimeoutSweepSecret,
} from '@/lib/internalLiveClockTimeoutAuth';
import { getLiveTimeoutSweepSecretValidationState } from '@/lib/runtimeConfigValidation';
import { processNextBotMoveRecoveryJob } from '@/lib/server/botMoveRecoveryWorker';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

const MAX_ROUNDS = 8;
const DEFAULT_BATCH = 25;

function parseBatch(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? DEFAULT_BATCH), 10);
  return Math.min(500, Math.max(1, Number.isFinite(n) ? n : DEFAULT_BATCH));
}

async function runLiveClockTimeoutSweep(batch: number): Promise<Response> {
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
  let sweepError: string | null = null;

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const { data, error } = await supabase.rpc('expire_live_clock_timeouts', { p_batch: batch });
    if (error) {
      sweepError = error.message;
      break;
    }

    const n = typeof data === 'number' ? data : parseInt(String(data ?? '0'), 10);
    const count = Number.isFinite(n) ? Math.max(0, n) : 0;
    finished += count;
    rounds += 1;

    if (count === 0) {
      break;
    }
  }

  const botRecovery = await processNextBotMoveRecoveryJob(supabase);

  return new Response(JSON.stringify({ finished, rounds, sweep_error: sweepError, bot_recovery: botRecovery }), {
    status: sweepError ? 503 : 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

function authorizedSweep(request: Request): Response | null {
  if (!getLiveTimeoutSweepSecretValidationState().ok) {
    return liveTimeoutSweepConfigInvalidJson();
  }
  if (!verifyLiveTimeoutSweepSecret(request)) {
    return liveTimeoutSweepUnauthorizedJson();
  }
  return null;
}

/**
 * POST: run expire_live_clock_timeouts in bounded rounds (service role only).
 * Auth: x-accl-live-timeout-sweep-secret or Authorization Bearer (Vercel Cron).
 */
export async function POST(request: Request): Promise<Response> {
  const denied = authorizedSweep(request);
  if (denied) return denied;

  let batch = DEFAULT_BATCH;
  try {
    const body = (await request.json()) as { batch?: unknown } | null;
    batch = parseBatch(body?.batch);
  } catch {
    batch = DEFAULT_BATCH;
  }

  return runLiveClockTimeoutSweep(batch);
}

/** GET: same sweep — used by Vercel Cron (optional ?batch=25). */
export async function GET(request: Request): Promise<Response> {
  const denied = authorizedSweep(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const batch = parseBatch(url.searchParams.get('batch'));
  return runLiveClockTimeoutSweep(batch);
}
