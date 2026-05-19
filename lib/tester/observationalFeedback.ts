/**
 * Tester feedback systems are observational only.
 * They may not mutate gameplay state.
 *
 * Do not add auto-remediation, auto-requeue, moderation hooks, hidden operational
 * overrides, or gameplay mutation side effects to tester feedback paths.
 */
export const TESTER_FEEDBACK_OBSERVATIONAL_INVARIANT =
  'Tester feedback systems are observational only. They may not mutate gameplay state.' as const;
