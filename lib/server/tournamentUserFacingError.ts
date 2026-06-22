import { EMAIL_VERIFICATION_REQUIRED_MESSAGE } from '@/lib/emailVerificationGate';
import { TOURNAMENT_REGISTRATION_CLOSED_CODE, TOURNAMENT_REGISTRATION_CLOSED_MESSAGE } from '@/lib/server/tournamentRegistrationGate';

const STABLE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Sign in again, then retry.',
  INVALID_JSON: 'Invalid request. Refresh and try again.',
  TOURNAMENT_ID_REQUIRED: 'Tournament id is required.',
  INVALID_TOURNAMENT_ID: 'Tournament id must be a valid UUID.',
  TOURNAMENT_FREE_JOIN_NOT_ALLOWED: 'You are not eligible to join this tournament in your region.',
  TOURNAMENT_ENTRY_NOT_ALLOWED: 'Paid tournament entry is not available for your account.',
  PROFILE_NOT_FOUND: 'Profile not found for this account.',
  TOURNAMENT_NOT_FOUND: 'Tournament not found.',
  TOURNAMENT_NOT_JOINABLE:
    'This tournament is not open for registration — it must still be in the pending state.',
  PAID_ENTRY_REQUIRED: 'This tournament requires paid entry — use the payment flow on the tournament page.',
  ECOSYSTEM_MISMATCH: 'This tournament is not available in your ecosystem.',
  [TOURNAMENT_REGISTRATION_CLOSED_CODE]: TOURNAMENT_REGISTRATION_CLOSED_MESSAGE,
  TOURNAMENT_FULL: 'This tournament is full.',
  SERVER_MISCONFIGURED: 'Tournament service is not configured. Try again later.',
  UNEXPECTED_ERROR: 'Something went wrong. Try again.',
  MATCH_COUNT_FAILED: 'Could not verify tournament status. Try again.',
  ENTRANT_COUNT_FAILED: 'Could not verify tournament capacity. Try again.',
  ENTRY_LOOKUP_FAILED: 'Could not verify your registration. Try again.',
  ENTRY_INSERT_FAILED: 'Could not complete registration. Try again.',
  PROFILE_LOOKUP_FAILED: 'Could not load your profile. Try again.',
  TOURNAMENT_LOOKUP_FAILED: 'Could not load this tournament. Try again.',
  SNAPSHOT_LOAD_FAILED: 'Could not load tournament details. Try again.',
  NOT_VISIBLE: 'This tournament is not available to view.',
  K12_REQUIRES_AUTH: 'Sign in required for school ecosystem tournaments.',
  NOT_FOUND: 'Tournament not found.',
  INVALID_TOURNAMENT_ID_SNAPSHOT: 'Invalid tournament id.',
  paid_entry_disabled: 'Paid entry is temporarily unavailable.',
  email_verification_required: EMAIL_VERIFICATION_REQUIRED_MESSAGE,
};

function looksLikeInternalError(m: string): boolean {
  return (
    /PGRST|SQLSTATE|relation |column |duplicate key value|violates .* constraint/i.test(m) ||
    /^[A-Z][A-Z0-9_]{2,}:/.test(m)
  );
}

/** Map API `code` (+ optional raw server detail) to stable client-facing copy. */
export function tournamentUserFacingMessage(
  code: string | null | undefined,
  rawDetail?: string | null,
): string {
  const c = String(code ?? '').trim();
  if (c && STABLE_MESSAGES[c]) return STABLE_MESSAGES[c];
  const raw = String(rawDetail ?? '').trim();
  if (raw && STABLE_MESSAGES[raw]) return STABLE_MESSAGES[raw];
  if (raw && !looksLikeInternalError(raw) && raw.length <= 220) return raw;
  return STABLE_MESSAGES.UNEXPECTED_ERROR ?? 'Something went wrong. Try again.';
}

export function tournamentApiErrorPayload(
  code: string,
  rawDetail?: string | null,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    code,
    error: tournamentUserFacingMessage(code, rawDetail),
    ...extra,
  };
}

/** Sanitize an existing API payload's `error` field while preserving codes and extras. */
export function withTournamentUserFacingError(payload: Record<string, unknown>): Record<string, unknown> {
  const code = String(payload.code ?? '').trim() || undefined;
  const raw = payload.error != null ? String(payload.error) : null;
  return {
    ...payload,
    error: tournamentUserFacingMessage(code, raw),
  };
}
