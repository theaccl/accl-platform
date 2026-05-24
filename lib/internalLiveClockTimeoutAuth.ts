/** Shared auth for POST /api/internal/live-clock-timeout/process (server-only). */
import { getLiveTimeoutSweepSecretValidationState } from '@/lib/runtimeConfigValidation';

function timingSafeEqualSecret(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function liveTimeoutSweepSecret(): string {
  return (
    process.env.ACCL_LIVE_TIMEOUT_SWEEP_SECRET?.trim() ??
    process.env.ACCL_ANALYSIS_QUEUE_SECRET?.trim() ??
    ''
  );
}

export function verifyLiveTimeoutSweepSecret(request: Request): boolean {
  const secretState = getLiveTimeoutSweepSecretValidationState();
  if (!secretState.ok) return false;
  const expected = liveTimeoutSweepSecret();
  const header = request.headers.get('x-accl-live-timeout-sweep-secret') ?? '';
  return timingSafeEqualSecret(header, expected);
}

export function liveTimeoutSweepUnauthorizedJson(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function liveTimeoutSweepConfigInvalidJson(): Response {
  const state = getLiveTimeoutSweepSecretValidationState();
  return new Response(
    JSON.stringify({
      error: 'Live timeout sweep configuration invalid',
      category: state.category,
      key: state.key,
      detail: state.detail,
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
