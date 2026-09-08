export type GenerationStatusFetchDisposition =
  | 'success'
  | 'signed_out'
  | 'unavailable'
  | 'retry';

export type CandidatePresentationPhase =
  | 'reveal'
  | 'holding'
  | 'accepted_still'
  | 'rejected_still'
  | 'still';

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

export function candidatePresentationPhase(input: {
  status: 'review' | 'approved' | 'rejected' | 'expired' | 'deleted';
  accepted: boolean;
  firstPresentation: boolean;
  motionAllowed: boolean;
}): CandidatePresentationPhase {
  if (input.accepted || input.status === 'approved') return 'accepted_still';
  if (input.status === 'rejected') return 'rejected_still';
  if (input.status !== 'review' || !input.motionAllowed) return 'still';
  return input.firstPresentation ? 'reveal' : 'holding';
}
