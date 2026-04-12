import type { SupabaseClient } from '@supabase/supabase-js';
import { getPaymentProvider } from '@/lib/payments/paymentProvider';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

export type RefundResult = { ok: boolean; message?: string; already_done?: boolean };

/**
 * Idempotent refund for a completed entry payment — financial layer only; does not remove tournament entries.
 */
export async function processRefundForEntryTransaction(
  supabase: SupabaseClient,
  params: { transactionId: string; reason: string; idempotencyKey: string }
): Promise<RefundResult> {
  const { transactionId, reason, idempotencyKey } = params;

  const { data: tx, error: txErr } = await supabase
    .from('payment_transactions')
    .select('id, user_id, type, status, provider_payment_id, amount_cents, metadata')
    .eq('id', transactionId)
    .maybeSingle();

  if (txErr || !tx) {
    return { ok: false, message: 'transaction_not_found' };
  }

  if (tx.type !== 'entry') {
    return { ok: false, message: 'not_entry_transaction' };
  }

  if (tx.status === 'refunded') {
    auditApiLog('refund_entry', { result: 'idempotent_skip', transaction: shortId(transactionId) });
    return { ok: true, already_done: true };
  }

  if (tx.status !== 'completed' && tx.status !== 'disputed') {
    return { ok: false, message: `invalid_status:${tx.status}` };
  }

  const refundLedgerId = `refund:${transactionId}`;
  const { data: existingRefund } = await supabase
    .from('payment_transactions')
    .select('id')
    .eq('provider_payment_id', refundLedgerId)
    .maybeSingle();
  if (existingRefund?.id) {
    auditApiLog('refund_entry', { result: 'idempotent_refund_exists', transaction: shortId(transactionId) });
    return { ok: true, already_done: true };
  }

  const provider = await getPaymentProvider();
  const pi = tx.provider_payment_id;
  if (!pi) {
    return { ok: false, message: 'missing_provider_payment_id' };
  }

  if (provider.createRefund) {
    try {
      await provider.createRefund({ providerPaymentId: pi, amountCents: Number(tx.amount_cents) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'refund_failed';
      auditApiLog('refund_entry', { result: 'provider_refund_failed', detail: msg });
      return { ok: false, message: msg };
    }
  }

  const now = new Date().toISOString();
  const { error: insErr } = await supabase.from('payment_transactions').insert({
    user_id: tx.user_id,
    tournament_id: null,
    amount_cents: tx.amount_cents,
    currency: 'usd',
    type: 'refund',
    status: 'completed',
    provider: provider.name,
    provider_payment_id: refundLedgerId,
    metadata: {
      refund_of: transactionId,
      reason,
      idempotency_key: idempotencyKey,
    },
  });

  if (insErr) {
    if (/duplicate key|unique constraint/i.test(insErr.message)) {
      auditApiLog('refund_entry', { result: 'idempotent_refund_exists', transaction: shortId(transactionId) });
      return { ok: true, already_done: true };
    }
    auditApiLog('refund_entry', { result: 'insert_failed', detail: insErr.message });
    return { ok: false, message: insErr.message };
  }

  await supabase
    .from('payment_transactions')
    .update({
      status: 'refunded',
      updated_at: now,
      metadata: {
        ...(typeof tx.metadata === 'object' && tx.metadata && !Array.isArray(tx.metadata)
          ? (tx.metadata as Record<string, unknown>)
          : {}),
        refund_reason: reason,
        refunded_at: now,
      },
    })
    .eq('id', transactionId);

  auditApiLog('refund_entry', { result: 'ok', transaction: shortId(transactionId), user: shortId(tx.user_id) });
  return { ok: true };
}

/**
 * Provider already refunded (e.g. charge.refunded webhook) — ledger only, no second Stripe call.
 */
export async function recordRefundFromProviderWebhook(
  supabase: SupabaseClient,
  params: { paymentIntentId: string; eventId: string }
): Promise<void> {
  const { data: tx } = await supabase
    .from('payment_transactions')
    .select('id, user_id, amount_cents, status, type, metadata')
    .eq('provider_payment_id', params.paymentIntentId)
    .eq('type', 'entry')
    .maybeSingle();

  if (!tx || tx.status === 'refunded') return;

  const refundLedgerId = `refund:${tx.id}`;
  const { data: dup } = await supabase.from('payment_transactions').select('id').eq('provider_payment_id', refundLedgerId).maybeSingle();
  if (dup?.id) return;

  const now = new Date().toISOString();
  const pv = await getPaymentProvider();
  const { error: insErr } = await supabase.from('payment_transactions').insert({
    user_id: tx.user_id,
    tournament_id: null,
    amount_cents: tx.amount_cents,
    currency: 'usd',
    type: 'refund',
    status: 'completed',
    provider: pv.name,
    provider_payment_id: refundLedgerId,
    metadata: {
      refund_of: tx.id,
      reason: 'provider_webhook',
      stripe_event_id: params.eventId,
    },
  });

  if (insErr && !/duplicate key|unique constraint/i.test(insErr.message)) {
    auditApiLog('refund_webhook', { result: 'insert_failed', detail: insErr.message });
    return;
  }

  const prevMeta =
    tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
      ? (tx.metadata as Record<string, unknown>)
      : {};
  await supabase
    .from('payment_transactions')
    .update({
      status: 'refunded',
      updated_at: now,
      metadata: { ...prevMeta, refund_reason: 'provider_webhook', refunded_at: now },
    })
    .eq('id', tx.id);

  auditApiLog('refund_webhook', { result: 'recorded', transaction: shortId(tx.id) });
}
