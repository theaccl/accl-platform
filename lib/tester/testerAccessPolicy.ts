/**
 * Tester route access policy (middleware + username gate).
 *
 * **Current policy:** `/tester/*` requires a signed-in session and a claimed public username
 * (`pathnameRequiresUsernameClaim` + middleware), same as NEXUS/modes. There is **no** additional
 * gate on `profiles.accl_tester` for these routes — any user who completed username onboarding
 * can open tester welcome, lobby chat, and messages.
 *
 * The `profiles.accl_tester` column is the **source of truth** for who belongs to the **invited
 * tester cohort** (data hygiene, operator readiness reports, audits). Use it to seed/audit accounts,
 * not to deny routes unless product explicitly adds a gate later.
 */
export const TESTER_ROUTES_REQUIRE_ACCL_TESTER_FLAG = false as const;
