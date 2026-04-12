import { NextResponse } from "next/server";
import {
  getStripeDeployMode,
  isPaidEntryDisabled,
  isPayoutProcessingDisabled,
} from "@/lib/server/deployReadiness";

export const runtime = "nodejs";

/**
 * Readiness-style signal: env presence only (no secret values).
 * Use /api/health for pure liveness.
 */
export async function GET() {
  const hasPublicUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  const hasServiceRole = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  const hasQueueSecret = Boolean(process.env.ACCL_ANALYSIS_QUEUE_SECRET?.trim()?.length);
  const hasInternalPaymentsSecret = Boolean(process.env.ACCL_INTERNAL_PAYMENTS_SECRET?.trim()?.length);
  const stripeMode = getStripeDeployMode();
  const stripeAcceptable = stripeMode === "stub" || stripeMode === "test";
  const killPaidEntry = isPaidEntryDisabled();
  const killPayout = isPayoutProcessingDisabled();

  /** Core env + Stripe test/stub only — kill switches are operational, not readiness failures. */
  const ready =
    hasPublicUrl && hasAnon && hasServiceRole && stripeAcceptable;

  return NextResponse.json({
    ok: hasPublicUrl && hasAnon,
    ready,
    node_env: process.env.NODE_ENV ?? "unknown",
    control: {
      soft_launch: true,
      stripe_mode: stripeMode,
      stripe_test_only: stripeAcceptable,
      paid_entry_available: !killPaidEntry,
      payout_processing_available: !killPayout,
      kill_switch_paid_entry: killPaidEntry,
      kill_switch_payout_processing: killPayout,
    },
    checks: {
      next_public_supabase_url: hasPublicUrl,
      next_public_supabase_anon: hasAnon,
      service_role_configured: hasServiceRole,
      analysis_queue_secret_configured: hasQueueSecret,
      internal_payments_secret_configured: hasInternalPaymentsSecret,
    },
  });
}
