export type GenerationStatusFetchDisposition =
  | 'success'
  | 'signed_out'
  | 'unavailable'
  | 'retry';

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);

export function generationStatusFetchDisposition(
  status: number
): GenerationStatusFetchDisposition {
  if (status >= 200 && status < 300) return 'success';
  if (status === 401) return 'signed_out';
  if (RETRYABLE_STATUS_CODES.has(status) || status >= 500) return 'retry';
  return 'unavailable';
}

export function generationStatusRetryDelay(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return Math.min(15_000, 3_000 * 2 ** safeAttempt);
}
