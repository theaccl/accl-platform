import type { SupabaseClient } from '@supabase/supabase-js';
import { getMinPayoutCents } from '@/lib/payments/complianceConfig';

export type PayoutEligibilityResult =
  | { ok: true }
  | { ok: false; reason: 'profile_incomplete' | 'restricted' | 'held' | 'below_minimum'; detail?: string };

type ProfileRow = {
  legal_name: string | null;
  country: string | null;
  payout_eligibility_status: string | null;
  tax_status: string | null;
};

/**
 * Payout rails only — never used for tournament entry or gameplay.
 */
export async function evaluatePayoutEligibility(
  supabase: SupabaseClient,
  userId: string,
  amountCents: number
): Promise<PayoutEligibilityResult> {
  const { data: p, error } = await supabase
    .from('profiles')
    .select('legal_name, country, payout_eligibility_status, tax_status')
    .eq('id', userId)
    .maybeSingle();

  if (error || !p) {
    return { ok: false, reason: 'profile_incomplete', detail: 'profile_not_found' };
  }

  const row = p as ProfileRow;
  const legal = row.legal_name?.trim();
  const country = row.country?.trim();
  if (!legal || !country) {
    return { ok: false, reason: 'profile_incomplete' };
  }

  if (String(row.tax_status ?? '') === 'restricted') {
    return { ok: false, reason: 'restricted', detail: 'tax_restricted' };
  }

  const pes = String(row.payout_eligibility_status ?? 'incomplete');
  if (pes === 'restricted') {
    return { ok: false, reason: 'restricted', detail: 'payout_restricted' };
  }
  if (pes === 'held') {
    return { ok: false, reason: 'held', detail: 'payout_held' };
  }

  const min = getMinPayoutCents();
  if (amountCents > 0 && amountCents < min) {
    return { ok: false, reason: 'below_minimum', detail: `min_${min}` };
  }

  return { ok: true };
}

