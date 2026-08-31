/**
 * Stripe webhook business logic — called from async queue after idempotent event registration.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinancialWebhookResult } from '@/lib/payments/paymentProvider';
import { recordFailedEntryPayment } from '@/lib/payments/fraudSignals';
import { recordRefundFromProviderWebhook } from '@/lib/payments/refundService';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import {
  checkTournamentRegistrationOpen,
  TOURNAMENT_REGISTRATION_CLOSED_CODE,
} from '@/lib/server/tournamentRegistrationGate';

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
    case 'pro_subscription_changed':
      return parsed.eventType;
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
    case 'pro_subscription_changed':
      await executeProSubscriptionChanged(supabase, parsed);
      return;
    default:
      return;
  }
}

export async function executeProSubscriptionChanged(
  supabase: SupabaseClient,
  parsed: Extract<FinancialWebhookResult, { kind: 'pro_subscription_changed' }>
): Promise<void> {
  const { error } = await supabase.rpc('sync_pro_subscription_entitlement', {
    p_provider_event_id: parsed.eventId,
    p_event_type: parsed.eventType,
    p_provider_created_at: parsed.providerCreatedAt,
    p_user_id: parsed.userId,
    p_provider_subscription_id: parsed.subscriptionId,
    p_provider_customer_id: parsed.customerId,
    p_status: parsed.status,
    p_cancel_at_period_end: parsed.cancelAtPeriodEnd,
    p_current_period_end: parsed.currentPeriodEnd,
    p_subscription_started_at: parsed.subscriptionStartedAt,
  });
  if (error) {
    auditApiLog('pro_subscription_webhook', {
      result: 'sync_failed',
      event: shortId(parsed.eventId),
      detail: error.message,
    });
    throw new Error(error.message);
  }
  auditApiLog('pro_subscription_webhook', {
    result: 'synced',
    event: shortId(parsed.eventId),
    subscription: shortId(parsed.subscriptionId),
    status: parsed.status,
  });
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

  const registration = await checkTournamentRegistrationOpen(supabase, tx.tournament_id);
  if (!registration.open && registration.code !== TOURNAMENT_REGISTRATION_CLOSED_CODE) {
    auditApiLog('payment_webhook', {
      result: 'registration_gate_failed',
      code: registration.code,
      transaction: shortId(tx.id),
    });
    throw new Error(registration.message);
  }
  const registrationClosed = !registration.open;

  if (tx.status === 'completed') {
    const { data: entry } = await supabase
      .from('tournament_entries')
      .select('user_id')
      .eq('tournament_id', tx.tournament_id)
      .eq('user_id', tx.user_id)
      .maybeSingle();
    if (!entry) {
      if (registrationClosed) {
        auditApiLog('payment_webhook', {
          result: 'registration_closed_repair_skipped',
          transaction: shortId(tx.id),
          tournament_id: shortId(tx.tournament_id),
        });
        return;
      }
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
        ...(registrationClosed ? { registration_closed: true } : {}),
      },
    })
    .eq('id', tx.id)
    .eq('status', 'pending');

  if (updErr) {
    auditApiLog('payment_webhook', { result: 'update_failed', detail: updErr.message });
    throw new Error(updErr.message);
  }

  if (registrationClosed) {
    auditApiLog('payment_webhook', {
      result: 'registration_closed_no_entry',
      transaction: shortId(tx.id),
      tournament_id: shortId(tx.tournament_id),
      user: shortId(tx.user_id),
    });
    return;
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
