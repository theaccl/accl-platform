/**
 * Phase 30 — controlled launch: kill switches and Stripe mode signals (no secret values).
 */

/** Stripe: test keys, stub, or blocked live (never used for payments in this codebase path). */
export type StripeDeployMode = 'stub' | 'test' | 'live_blocked';

export function getStripeDeployMode(): StripeDeployMode {
  const s = process.env.STRIPE_SECRET_KEY?.trim();
  if (!s) return 'stub';
  if (s.startsWith('sk_live_')) return 'live_blocked';
  if (s.startsWith('sk_test_')) return 'test';
  return 'stub';
}

/** Paid tournament entry (create payment intent) — flip in Vercel in under a minute. */
export function isPaidEntryDisabled(): boolean {
  const v = process.env.ACCL_DISABLE_PAID_ENTRY?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Payout processing + retry worker + internal payout/refund triggers. */
export function isPayoutProcessingDisabled(): boolean {
  const v = process.env.ACCL_DISABLE_PAYOUT_PROCESSING?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
