/**
 * Stripe webhook business logic — called from async queue after idempotent event registration.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinancialWebhookResult } from '@/lib/payments/paymentProvider';
import { recordFailedEntryPayment } from '@/lib/payments/fraudSignals';
import { recordRefundFromProviderWebhook } from '@/lib/payments/refundService';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

function eventTypeLabel(parsed: FinancialWebhookResult): string {
  switch (parsed.kind) {
    case 'payment_succeeded':
      return 'payment_intent.succeeded';
    case 'payment_intent_failed':
      return 'payment_intent.payment_failed';
    case 'charge_dispute_created':
      return 'charge.dispute.created';
    case 'charge_refunded':
      return 'charge.refunded';
    default:
      return 'unknown';
  }
}

/**
 * Insert webhook dedup row. Returns false if Stripe delivered a duplicate event id.
 */
export async function registerWebhookEventOnce(
  supabase: SupabaseClient,
  parsed: Exclude<FinancialWebhookResult, { kind: 'ignored' }>
): Promise<boolean> {
  const { error } = await supabase.from('payment_webhook_events').insert({
    provider_event_id: parsed.eventId,
    event_type: eventTypeLabel(parsed),
    payload: { kind: parsed.kind } as unknown as Record<string, unknown>,
  });
  if (error && /duplicate key|unique constraint/i.test(error.message ?? '')) {
    auditApiLog('payment_webhook', { result: 'duplicate_event', event: shortId(parsed.eventId) });
    return false;
  }
  if (error) {
    auditApiLog('payment_webhook', { result: 'webhook_register_failed', detail: error.message });
    throw new Error(error.message);
  }
  return true;
}

/**
 * Idempotent registration then processing — safe for in-process queue retries.
 * Duplicate Stripe event ids stop before execute (no double entry / ledger writes).
 */
export async function registerAndExecuteFinancialWebhook(
  supabase: SupabaseClient,
  parsed: Exclude<FinancialWebhookResult, { kind: 'ignored' }>
): Promise<void> {
  const first = await registerWebhookEventOnce(supabase, parsed);
  if (!first) return;
  await executeFinancialWebhook(supabase, parsed);
}

export async function executeFinancialWebhook(
  supabase: SupabaseClient,
  parsed: Exclude<FinancialWebhookResult, { kind: 'ignored' }>
): Promise<void> {
  switch (parsed.kind) {
    case 'payment_succeeded':
      await executePaymentSucceeded(supabase, parsed);
      return;
    case 'payment_intent_failed':
      await executePaymentIntentFailed(supabase, parsed);
      return;
    case 'charge_dispute_created':
      await executeChargeDispute(supabase, parsed);
      return;
    case 'charge_refunded':
      await executeChargeRefunded(supabase, parsed);
      return;
    default:
      return;
  }
}

async function executePaymentSucceeded(
  supabase: SupabaseClient,
  parsed: Extract<FinancialWebhookResult, { kind: 'payment_succeeded' }>
): Promise<void> {
  const { eventId, providerPaymentId, metadata } = parsed;

  const { data: tx, error: txErr } = await supabase
    .from('payment_transactions')
    .select('id, user_id, tournament_id, amount_cents, status, type, metadata')
    .eq('provider_payment_id', providerPaymentId)
    .maybeSingle();

  if (txErr || !tx?.id) {
    auditApiLog('payment_webhook', { result: 'transaction_not_found', pi: shortId(providerPaymentId) });
    return;
  }

  if (tx.type !== 'entry' || !tx.tournament_id) {
    auditApiLog('payment_webhook', { result: 'unexpected_type', transaction: shortId(tx.id) });
    return;
  }

  const metaUser = metadata.user_id?.trim();
  const metaTournament = metadata.tournament_id?.trim();
  const metaTx = metadata.accl_transaction_id?.trim();
  if (metaUser && metaUser !== tx.user_id) {
    auditApiLog('payment_webhook', { result: 'metadata_user_mismatch' });
    return;
  }
  if (metaTournament && metaTournament !== tx.tournament_id) {
    auditApiLog('payment_webhook', { result: 'metadata_tournament_mismatch' });
    return;
  }
  if (metaTx && metaTx !== tx.id) {
    auditApiLog('payment_webhook', { result: 'metadata_tx_mismatch' });
    return;
  }

  if (tx.status === 'completed') {
    const { data: entry } = await supabase
      .from('tournament_entries')
      .select('user_id')
      .eq('tournament_id', tx.tournament_id)
      .eq('user_id', tx.user_id)
      .maybeSingle();
    if (!entry) {
      await supabase.from('tournament_entries').insert({
        tournament_id: tx.tournament_id,
        user_id: tx.user_id,
      });
      auditApiLog('payment_webhook', { result: 'entry_repaired', transaction: shortId(tx.id) });
    }
    return;
  }

  const now = new Date().toISOString();
  const prevMeta =
    tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
      ? (tx.metadata as Record<string, unknown>)
      : {};
  const { error: updErr } = await supabase
    .from('payment_transactions')
    .update({
      status: 'completed',
      updated_at: now,
      metadata: {
        ...prevMeta,
        completed_via: 'webhook',
        provider_event_id: eventId,
      },
    })
    .eq('id', tx.id)
    .eq('status', 'pending');

  if (updErr) {
    auditApiLog('payment_webhook', { result: 'update_failed', detail: updErr.message });
    throw new Error(updErr.message);
  }

  const { error: entryErr } = await supabase.from('tournament_entries').insert({
    tournament_id: tx.tournament_id,
    user_id: tx.user_id,
  });

  if (entryErr && !/duplicate key|unique constraint/i.test(entryErr.message ?? '')) {
    auditApiLog('payment_webhook', { result: 'entry_insert_failed', detail: entryErr.message });
    throw new Error(entryErr.message);
  }

  auditApiLog('payment_webhook', {
    result: 'ok',
    transaction: shortId(tx.id),
    tournament_id: shortId(tx.tournament_id),
    user: shortId(tx.user_id),
  });
}

async function executePaymentIntentFailed(
  supabase: SupabaseClient,
  parsed: Extract<FinancialWebhookResult, { kind: 'payment_intent_failed' }>
): Promise<void> {
  const { data: failRow } = await supabase
    .from('payment_transactions')
    .select('id, user_id, metadata')
    .eq('provider_payment_id', parsed.paymentIntentId)
    .eq('type', 'entry')
    .maybeSingle();
  if (failRow?.id) {
    const prev =
      failRow.metadata && typeof failRow.metadata === 'object' && !Array.isArray(failRow.metadata)
        ? (failRow.metadata as Record<string, unknown>)
        : {};
    await supabase
      .from('payment_transactions')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
        metadata: { ...prev, failed_via: 'webhook', provider_event_id: parsed.eventId },
      })
      .eq('id', failRow.id)
      .eq('status', 'pending');
    if (failRow.user_id) {
      await recordFailedEntryPayment(supabase, failRow.user_id);
    }
  }
  auditApiLog('payment_webhook', { result: 'payment_failed', pi: shortId(parsed.paymentIntentId) });
}

async function executeChargeDispute(
  supabase: SupabaseClient,
  parsed: Extract<FinancialWebhookResult, { kind: 'charge_dispute_created' }>
): Promise<void> {
  if (!parsed.paymentIntentId) {
    auditApiLog('payment_webhook', { result: 'dispute_no_pi', event: parsed.eventId });
    return;
  }
  const { data: dRow } = await supabase
    .from('payment_transactions')
    .select('id, metadata')
    .eq('provider_payment_id', parsed.paymentIntentId)
    .eq('type', 'entry')
    .maybeSingle();
  if (dRow?.id) {
    const prev =
      dRow.metadata && typeof dRow.metadata === 'object' && !Array.isArray(dRow.metadata)
        ? (dRow.metadata as Record<string, unknown>)
        : {};
    await supabase
      .from('payment_transactions')
      .update({
        status: 'disputed',
        updated_at: new Date().toISOString(),
        metadata: { ...prev, dispute_opened: true, stripe_event_id: parsed.eventId },
      })
      .eq('id', dRow.id);
  }
  auditApiLog('payment_dispute', { result: 'marked_disputed', pi: shortId(parsed.paymentIntentId) });
}

async function executeChargeRefunded(
  supabase: SupabaseClient,
  parsed: Extract<FinancialWebhookResult, { kind: 'charge_refunded' }>
): Promise<void> {
  if (!parsed.paymentIntentId) return;
  await recordRefundFromProviderWebhook(supabase, {
    paymentIntentId: parsed.paymentIntentId,
    eventId: parsed.eventId,
  });
  auditApiLog('payment_webhook', { result: 'charge_refunded_processed' });
}
