import { profileRowNeedsUsername, validateAcclUsername } from '@/lib/usernameRules';

export type TesterProfileRow = {
  id: string;
  username: string | null;
  accl_tester: boolean;
};

export type TesterReadinessChecks = {
  has_profile: boolean;
  username_claimed: boolean;
  username_valid_for_accl: boolean;
  identity_safe: boolean;
  tester_cohort_flag: boolean;
};

export type TesterReadinessResult = {
  profile_id: string;
  username: string | null;
  accl_tester: boolean;
  checks: TesterReadinessChecks;
  /** True when this row meets cohort readiness (username + policy + flag + safe identity). */
  cohort_ready: boolean;
  /** Blockers for invite-day (human-readable codes). */
  issues: string[];
};

/**
 * Evaluate a profile row for tester cohort readiness (invite-day hygiene).
 * Does not perform network calls.
 */
export function evaluateTesterProfileReadiness(row: TesterProfileRow | null): TesterReadinessResult {
  const issues: string[] = [];
  if (!row?.id) {
    return {
      profile_id: '',
      username: null,
      accl_tester: false,
      checks: {
        has_profile: false,
        username_claimed: false,
        username_valid_for_accl: false,
        identity_safe: false,
        tester_cohort_flag: false,
      },
      cohort_ready: false,
      issues: ['missing_profile_row'],
    };
  }

  const username = row.username?.trim() ? row.username.trim() : null;
  const username_claimed = !profileRowNeedsUsername(row.username);
  if (!username_claimed) issues.push('missing_username');

  let username_valid_for_accl = false;
  if (username_claimed && username) {
    const v = validateAcclUsername(username);
    username_valid_for_accl = v.ok;
    if (!v.ok) issues.push('invalid_username');
  }

  const identity_safe = !username?.includes('@');
  if (!identity_safe) issues.push('email_shaped_username');

  const tester_cohort_flag = row.accl_tester === true;
  if (!tester_cohort_flag) issues.push('tester_flag_false');

  const cohort_ready =
    username_claimed && username_valid_for_accl && identity_safe && tester_cohort_flag;

  return {
    profile_id: row.id,
    username,
    accl_tester: row.accl_tester,
    checks: {
      has_profile: true,
      username_claimed,
      username_valid_for_accl,
      identity_safe,
      tester_cohort_flag,
    },
    cohort_ready,
    issues,
  };
}
