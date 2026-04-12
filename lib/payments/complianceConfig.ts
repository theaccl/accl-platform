/**
 * Business / compliance display config — env-driven, no gameplay coupling.
 */
export function getComplianceBranding(): {
  platform_entity_name: string;
  payout_descriptor: string;
} {
  return {
    platform_entity_name: process.env.ACCL_PLATFORM_ENTITY_NAME?.trim() || 'ACCL Platform',
    payout_descriptor: process.env.ACCL_PAYOUT_DESCRIPTOR?.trim() || 'Tournament payouts · verified results',
  };
}

export function getMinPayoutCents(): number {
  const raw = process.env.ACCL_MIN_PAYOUT_CENTS?.trim();
  const n = raw ? parseInt(raw, 10) : 100;
  return Number.isFinite(n) && n >= 0 ? n : 100;
}

/** Foundation-only: YTD payout total above this shows a generic reporting notice (not tax filing). */
export function getTaxNoticeThresholdCents(): number {
  const raw = process.env.ACCL_TAX_NOTICE_THRESHOLD_CENTS?.trim();
  const n = raw ? parseInt(raw, 10) : 600_00;
  return Number.isFinite(n) && n > 0 ? n : 600_00;
}
