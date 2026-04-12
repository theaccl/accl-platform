import type { SupabaseClient } from '@supabase/supabase-js';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

/** payment_intent.payment_failed — increment counter; optional soft flag (no auto-ban). */
export async function recordFailedEntryPayment(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: row } = await supabase
    .from('profiles')
    .select('failed_entry_payment_count')
    .eq('id', userId)
    .maybeSingle();
  const n = typeof row?.failed_entry_payment_count === 'number' ? row.failed_entry_payment_count : 0;
  const next = n + 1;
  await supabase
    .from('profiles')
    .update({
      failed_entry_payment_count: next,
      ...(next >= 5 ? { financial_review_flag: 'repeated_failed_payments' } : {}),
    })
    .eq('id', userId);

  auditApiLog('fraud_signal', {
    kind: 'entry_payment_failed',
    user: shortId(userId),
    count: next,
  });
}

/** Many entry attempts across tournaments in a short window — log only. */
export async function evaluateAbnormalEntryPattern(
  supabase: SupabaseClient,
  userId: string,
  windowHours = 1
): Promise<void> {
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const { count } = await supabase
    .from('payment_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'entry')
    .gte('created_at', since);

  const c = count ?? 0;
  if (c > 10) {
    await supabase.from('profiles').update({ financial_review_flag: 'high_entry_velocity' }).eq('id', userId);
    auditApiLog('fraud_signal', { kind: 'abnormal_entry_pattern', user: shortId(userId), window_h: windowHours, count: c });
  }
}

/** Many completed payouts to same user in 24h — clustering signal (log only). */
export async function evaluatePayoutClustering(supabase: SupabaseClient, userId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from('payment_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'payout')
    .eq('status', 'completed')
    .gte('created_at', since);

  const c = count ?? 0;
  if (c > 5) {
    auditApiLog('fraud_signal', { kind: 'payout_clustering', user: shortId(userId), count_24h: c });
  }
}
