import type { SupabaseClient } from '@supabase/supabase-js';
import { getTaxNoticeThresholdCents } from '@/lib/payments/complianceConfig';
import { getUserWalletBalanceCents } from '@/lib/payments/balance';
import { getPayoutAmountYtdCents } from '@/lib/payments/yearToDatePayouts';

export type NexusComplianceSnapshot = {
  payout_profile_status: 'eligible' | 'action_required' | 'restricted';
  payout_profile_message: string;
  payout_amount_ytd_cents: number;
  tax_notice: boolean;
};

/**
 * Adult Nexus only — K–12 callers must not surface this.
 */
export async function getNexusComplianceSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<NexusComplianceSnapshot> {
  const { data: p } = await supabase
    .from('profiles')
    .select('legal_name, country, payout_eligibility_status, tax_status')
    .eq('id', userId)
    .maybeSingle();

  if (!p) {
    const ytd = await getPayoutAmountYtdCents(supabase, userId);
    return {
      payout_profile_status: 'action_required',
      payout_profile_message: 'Complete your payout profile to receive winnings (legal name and country).',
      payout_amount_ytd_cents: ytd,
      tax_notice: ytd >= getTaxNoticeThresholdCents(),
    };
  }

  const legal = p.legal_name?.trim();
  const country = p?.country?.trim();
  const pes = String(p?.payout_eligibility_status ?? 'incomplete');
  const tax = String(p?.tax_status ?? 'pending');

  let payout_profile_status: NexusComplianceSnapshot['payout_profile_status'] = 'action_required';
  let payout_profile_message = 'Complete your payout profile to receive winnings (legal name and country).';

  if (tax === 'restricted' || pes === 'restricted') {
    payout_profile_status = 'restricted';
    payout_profile_message = 'Payout access is restricted — contact support if this is unexpected.';
  } else if (pes === 'held') {
    payout_profile_status = 'action_required';
    payout_profile_message = 'Payout is on hold — complete verification steps when prompted.';
  } else if (legal && country) {
    payout_profile_status = 'eligible';
    payout_profile_message = 'Eligible for payout';
  }

  const payout_amount_ytd_cents = await getPayoutAmountYtdCents(supabase, userId);
  const tax_notice = payout_amount_ytd_cents >= getTaxNoticeThresholdCents();

  return {
    payout_profile_status,
    payout_profile_message,
    payout_amount_ytd_cents,
    tax_notice,
  };
}

export async function getAdultFinancialHookSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  wallet_balance_cents: number;
  compliance: NexusComplianceSnapshot;
}> {
  const [wallet_balance_cents, compliance] = await Promise.all([
    getUserWalletBalanceCents(supabase, userId),
    getNexusComplianceSnapshot(supabase, userId),
  ]);
  return { wallet_balance_cents, compliance };
}
