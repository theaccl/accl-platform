import { profileRowNeedsUsername } from '@/lib/usernameRules';

/** PostgREST filter for compare-and-set username claim updates. */
export type ProfileUsernameClaimCasFilter =
  | { kind: 'is_null' }
  | { kind: 'eq'; username: string };

export type ProfileUsernameClaimCasResolution =
  | { eligible: false; reason: 'already_claimed' }
  | { eligible: true; filter: ProfileUsernameClaimCasFilter };

/**
 * Resolve whether a stored username may be claimed and which CAS filter applies.
 * Uses the exact stored value for non-null comparisons (no trim or normalize).
 */
export function resolveProfileUsernameClaimCas(
  storedUsername: string | null | undefined,
): ProfileUsernameClaimCasResolution {
  if (!profileRowNeedsUsername(storedUsername)) {
    return { eligible: false, reason: 'already_claimed' };
  }

  if (storedUsername === null || storedUsername === undefined) {
    return { eligible: true, filter: { kind: 'is_null' } };
  }

  return { eligible: true, filter: { kind: 'eq', username: storedUsername } };
}
