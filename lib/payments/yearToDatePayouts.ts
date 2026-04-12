import type { SupabaseClient } from '@supabase/supabase-js';

/** Completed payout rows in the calendar year (USD cents). */
export async function getPayoutAmountYtdCents(supabase: SupabaseClient, userId: string): Promise<number> {
  const y = new Date().getUTCFullYear();
  const start = `${y}-01-01T00:00:00.000Z`;
  const { data, error } = await supabase
    .from('payment_transactions')
    .select('amount_cents')
    .eq('user_id', userId)
    .eq('type', 'payout')
    .eq('status', 'completed')
    .gte('created_at', start);

  if (error || !data) return 0;
  return data.reduce((s, r) => s + Number(r.amount_cents ?? 0), 0);
}
