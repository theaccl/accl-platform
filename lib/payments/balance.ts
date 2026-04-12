import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Derived wallet balance from completed ledger rows (cents, USD).
 * Entries debit; payouts/refunds credit.
 */
export async function getUserWalletBalanceCents(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select('type, status, amount_cents')
    .eq('user_id', userId)
    .in('status', ['completed', 'refunded', 'disputed']);

  if (error || !data) return 0;

  let sum = 0;
  for (const row of data) {
    const amt = Number(row.amount_cents ?? 0);
    if (row.type === 'entry' && (row.status === 'completed' || row.status === 'disputed')) sum -= amt;
    else if (row.type === 'entry' && row.status === 'refunded') sum += amt;
    else if (row.status === 'completed' && (row.type === 'payout' || row.type === 'refund')) sum += amt;
  }
  return sum;
}
