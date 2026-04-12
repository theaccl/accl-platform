/** Shared auth for /api/internal/analysis-queue/* (server-only). */
import { getQueueSecretValidationState } from '@/lib/runtimeConfigValidation';

function timingSafeEqualSecret(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function verifyAnalysisQueueSecret(request: Request): boolean {
  const secretState = getQueueSecretValidationState();
  if (!secretState.ok) return false;
  const expected = process.env.ACCL_ANALYSIS_QUEUE_SECRET?.trim() ?? '';
  const header = request.headers.get('x-accl-analysis-queue-secret') ?? '';
  return timingSafeEqualSecret(header, expected);
}

export function unauthorizedJson(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function queueConfigInvalidJson(): Response {
  const state = getQueueSecretValidationState();
  return new Response(
    JSON.stringify({
      error: 'Queue configuration invalid',
      category: state.category,
      key: state.key,
      detail: state.detail,
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
