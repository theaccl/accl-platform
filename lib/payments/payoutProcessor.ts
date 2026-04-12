import type { SupabaseClient } from '@supabase/supabase-js';
import { getPaymentProvider, createPayoutTransferWithRetry } from '@/lib/payments/paymentProvider';
import { evaluatePayoutEligibility } from '@/lib/payments/payoutEligibility';
import { evaluatePayoutClustering } from '@/lib/payments/fraudSignals';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

export type PayoutProcessorResult = {
  ok: boolean;
  tournament_id: string;
  payouts_created: number;
  payouts_held: number;
  message?: string;
};

function splitPoolCents(pool: number, winnerCount: number): number[] {
  if (winnerCount <= 0) return [];
  const base = Math.floor(pool / winnerCount);
  let rem = pool - base * winnerCount;
  const out: number[] = [];
  for (let i = 0; i < winnerCount; i++) {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    out.push(base + extra);
  }
  return out;
}

/**
 * Runs only for completed adult tournaments with verified results.
 * Multiple final-round winners split the pool equally; compliance gates per recipient.
 */
export async function processTournamentPayout(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<PayoutProcessorResult> {
  const { data: t, error: tErr } = await supabase
    .from('tournaments')
    .select('id,status,ecosystem_scope,prize_pool_cents,name')
    .eq('id', tournamentId)
    .maybeSingle();

  if (tErr || !t) {
    auditApiLog('payout_processor', { result: 'tournament_not_found', tournament_id: shortId(tournamentId) });
    return { ok: false, tournament_id: tournamentId, payouts_created: 0, payouts_held: 0, message: 'tournament_not_found' };
  }

  if (String(t.ecosystem_scope ?? 'adult') === 'k12') {
    auditApiLog('payout_processor', { result: 'k12_blocked', tournament_id: shortId(tournamentId) });
    return { ok: false, tournament_id: tournamentId, payouts_created: 0, payouts_held: 0, message: 'k12_no_money' };
  }

  if (String(t.status ?? '') !== 'completed') {
    auditApiLog('payout_processor', { result: 'not_completed', tournament_id: shortId(tournamentId) });
    return { ok: false, tournament_id: tournamentId, payouts_created: 0, payouts_held: 0, message: 'tournament_not_completed' };
  }

  const pool = typeof t.prize_pool_cents === 'number' ? t.prize_pool_cents : 0;
  if (pool <= 0) {
    auditApiLog('payout_processor', { result: 'no_prize_pool', tournament_id: shortId(tournamentId) });
    return { ok: true, tournament_id: tournamentId, payouts_created: 0, payouts_held: 0, message: 'no_prize_pool' };
  }

  const { data: maxR } = await supabase
    .from('tournament_matches')
    .select('round_number')
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxRound = maxR?.round_number;
  if (maxRound == null) {
    auditApiLog('payout_processor', { result: 'no_matches', tournament_id: shortId(tournamentId) });
    return { ok: false, tournament_id: tournamentId, payouts_created: 0, payouts_held: 0, message: 'no_matches' };
  }

  const { data: finalMatches } = await supabase
    .from('tournament_matches')
    .select('winner_id')
    .eq('tournament_id', tournamentId)
    .eq('round_number', maxRound)
    .not('winner_id', 'is', null);

  const winnerIds = [
    ...new Set((finalMatches ?? []).map((m) => (m.winner_id ? String(m.winner_id) : '')).filter(Boolean)),
  ];

  if (winnerIds.length === 0) {
    auditApiLog('payout_processor', { result: 'no_winner', tournament_id: shortId(tournamentId) });
    return { ok: false, tournament_id: tournamentId, payouts_created: 0, payouts_held: 0, message: 'no_winner' };
  }

  const shares = splitPoolCents(pool, winnerIds.length);
  const provider = await getPaymentProvider();
  const connectId = process.env.STRIPE_WINNER_CONNECT_ACCOUNT_ID?.trim() || undefined;

  let payouts_created = 0;
  let payouts_held = 0;

  for (let i = 0; i < winnerIds.length; i++) {
    const winnerId = winnerIds[i]!;
    const amountCents = shares[i] ?? 0;
    if (amountCents <= 0) continue;

    const { data: existing } = await supabase
      .from('payment_transactions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('type', 'payout')
      .eq('status', 'completed')
      .eq('user_id', winnerId)
      .maybeSingle();

    if (existing?.id) {
      auditApiLog('payout_processor', { result: 'idempotent_skip_winner', tournament_id: shortId(tournamentId), user: shortId(winnerId) });
      continue;
    }

    await evaluatePayoutClustering(supabase, winnerId);

    const elig = await evaluatePayoutEligibility(supabase, winnerId, amountCents);
    if (!elig.ok) {
      const { error: heldErr } = await supabase.from('payment_transactions').insert({
        user_id: winnerId,
        tournament_id: tournamentId,
        amount_cents: amountCents,
        currency: 'usd',
        type: 'payout',
        status: 'pending',
        provider: provider.name,
        metadata: {
          tournament_name: t.name,
          compliance_hold: true,
          hold_reason: elig.reason,
          detail: elig.detail ?? null,
          share_index: i,
          winners: winnerIds.length,
        },
      });
      if (heldErr) {
        auditApiLog('payout_processor', { result: 'held_insert_failed', detail: heldErr.message });
        return { ok: false, tournament_id: tournamentId, payouts_created, payouts_held, message: heldErr.message };
      }
      payouts_held += 1;
      auditApiLog('payout_processor', {
        result: 'payout_held',
        tournament_id: shortId(tournamentId),
        user: shortId(winnerId),
        reason: elig.reason,
      });
      continue;
    }

    const transfer = await createPayoutTransferWithRetry(provider, {
      amountCents,
      currency: 'usd',
      destinationConnectAccountId: connectId,
      metadata: {
        tournament_id: tournamentId,
        winner_user_id: winnerId,
        source: 'tournament_payout',
        share_index: String(i),
      },
      idempotencyKey: `payout-${tournamentId}-${winnerId}-${i}`,
    });

    const { data: inserted, error: insErr } = await supabase
      .from('payment_transactions')
      .insert({
        user_id: winnerId,
        tournament_id: tournamentId,
        amount_cents: amountCents,
        currency: 'usd',
        type: 'payout',
        status: transfer.status === 'completed' ? 'completed' : 'pending',
        provider: provider.name,
        provider_payment_id: transfer.transferId,
        metadata: {
          tournament_name: t.name,
          transfer_status: transfer.status,
          attempts: transfer.attempts,
          last_error: transfer.lastError ?? null,
          share_index: i,
          winners: winnerIds.length,
          raw: transfer.raw ?? null,
        },
      })
      .select('id')
      .single();

    if (insErr || !inserted?.id) {
      auditApiLog('payout_processor', { result: 'insert_failed', tournament_id: shortId(tournamentId), detail: insErr?.message });
      return { ok: false, tournament_id: tournamentId, payouts_created, payouts_held, message: insErr?.message };
    }

    if (
      provider.name !== 'stub' &&
      (transfer.status !== 'completed' || !transfer.transferId)
    ) {
      const nextRetry = new Date(Date.now() + 15 * 60_000).toISOString();
      const { error: qErr } = await supabase.from('payout_retry_queue').insert({
        payment_transaction_id: inserted.id,
        attempts: transfer.attempts,
        last_error: transfer.lastError ?? 'transfer_incomplete',
        next_retry_at: nextRetry,
      });
      if (qErr && !/duplicate key|unique constraint/i.test(qErr.message ?? '')) {
        auditApiLog('payout_processor', { result: 'retry_queue_failed', detail: qErr.message });
      }
      auditApiLog('payout_processor', {
        result: 'payout_retry_queued',
        tournament_id: shortId(tournamentId),
        user: shortId(winnerId),
        attempts: transfer.attempts,
      });
    }

    payouts_created += 1;
    auditApiLog('payout_processor', {
      result: 'ok',
      tournament_id: shortId(tournamentId),
      user: shortId(winnerId),
      amount_cents: amountCents,
      attempts: transfer.attempts,
    });
  }

  return { ok: true, tournament_id: tournamentId, payouts_created, payouts_held };
}
