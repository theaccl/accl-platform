/**
 * Phase 29 — DB-backed payout retry processor (interval-started from instrumentation).
 */
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { getPaymentProvider, createPayoutTransferWithRetry } from '@/lib/payments/paymentProvider';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { isPayoutProcessingDisabled } from '@/lib/server/deployReadiness';

const MAX_ATTEMPTS = 10;

export async function processPayoutRetryBatch(): Promise<void> {
  if (isPayoutProcessingDisabled()) {
    return;
  }
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('payout_retry_queue')
    .select('id, payment_transaction_id, attempts, last_error')
    .lte('next_retry_at', now)
    .lt('attempts', MAX_ATTEMPTS)
    .limit(25);

  if (error || !rows?.length) {
    if (error) {
      auditApiLog('payout_retry_batch', { result: 'query_failed', detail: error.message });
    }
    return;
  }

  const provider = await getPaymentProvider();
  const connectId = process.env.STRIPE_WINNER_CONNECT_ACCOUNT_ID?.trim() || undefined;

  for (const row of rows) {
    const qid = row.id as string;
    const txId = row.payment_transaction_id as string;
    const attempts = Number(row.attempts ?? 0);

    const { data: tx, error: txErr } = await supabase
      .from('payment_transactions')
      .select('id, user_id, tournament_id, amount_cents, metadata, status, type')
      .eq('id', txId)
      .maybeSingle();

    if (txErr || !tx) {
      await supabase.from('payout_retry_queue').delete().eq('id', qid);
      auditApiLog('payout_retry', { result: 'tx_missing', queue: shortId(qid) });
      continue;
    }

    if (String(tx.type ?? '') !== 'payout') {
      await supabase.from('payout_retry_queue').delete().eq('id', qid);
      auditApiLog('payout_retry', { result: 'wrong_type', transaction: shortId(txId) });
      continue;
    }

    if (tx.status === 'completed') {
      await supabase.from('payout_retry_queue').delete().eq('id', qid);
      continue;
    }

    const meta = (tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
      ? tx.metadata
      : {}) as Record<string, unknown>;
    const tournamentId = String(meta.tournament_id ?? tx.tournament_id ?? '');
    const winnerId = String(tx.user_id);

    const transfer = await createPayoutTransferWithRetry(
      provider,
      {
        amountCents: Number(tx.amount_cents),
        currency: 'usd',
        destinationConnectAccountId: connectId,
        metadata: {
          tournament_id: tournamentId,
          winner_user_id: winnerId,
          source: 'tournament_payout_retry',
          share_index: String(meta.share_index ?? ''),
        },
        idempotencyKey: `payout-retry-${txId}-${attempts + 1}`,
      },
      { maxAttempts: 2 }
    );

    auditApiLog('payout_retry', {
      result: transfer.status === 'completed' && transfer.transferId ? 'transfer_ok' : 'transfer_pending',
      transaction: shortId(txId),
      attempt: attempts + 1,
    });

    if (transfer.status === 'completed' && transfer.transferId) {
      await supabase
        .from('payment_transactions')
        .update({
          status: 'completed',
          provider_payment_id: transfer.transferId,
          updated_at: new Date().toISOString(),
          metadata: {
            ...meta,
            transfer_status: transfer.status,
            retry_completed: true,
            retry_attempts: attempts + 1,
          },
        })
        .eq('id', txId);
      await supabase.from('payout_retry_queue').delete().eq('id', qid);
      continue;
    }

    const nextAttempts = attempts + 1;
    const nextRetry = new Date(Date.now() + 15 * 60_000).toISOString();
    if (nextAttempts >= MAX_ATTEMPTS) {
      await supabase.from('payout_retry_queue').delete().eq('id', qid);
      auditApiLog('payout_retry', { result: 'abandoned_max_attempts', transaction: shortId(txId) });
      continue;
    }

    await supabase
      .from('payout_retry_queue')
      .update({
        attempts: nextAttempts,
        last_error: transfer.lastError ?? 'transfer_incomplete',
        next_retry_at: nextRetry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', qid);
  }
}

let intervalStarted = false;

export function startPayoutRetryInterval(): void {
  if (intervalStarted) return;
  intervalStarted = true;
  const ms = (() => {
    const raw = process.env.ACCL_PAYOUT_RETRY_INTERVAL_MS?.trim();
    const n = raw ? parseInt(raw, 10) : 60_000;
    return Number.isFinite(n) && n >= 10_000 ? n : 60_000;
  })();

  void processPayoutRetryBatch().catch(() => {});
  setInterval(() => {
    void processPayoutRetryBatch().catch(() => {});
  }, ms);
}
