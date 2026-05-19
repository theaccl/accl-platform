import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import {
  EligibilityEnforcementError,
  enforceTournamentRegistration,
  resolveEligibilityDecisionForUser,
} from '@/lib/tournamentEligibilityEnforcement';
import { getPaymentProvider } from '@/lib/payments/paymentProvider';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';
import { evaluateAbnormalEntryPattern } from '@/lib/payments/fraudSignals';
import { isPaidEntryDisabled } from '@/lib/server/deployReadiness';
import { checkTournamentRegistrationOpen } from '@/lib/server/tournamentRegistrationGate';
import { tournamentApiErrorPayload } from '@/lib/server/tournamentUserFacingError';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Body = { tournament_id?: unknown };

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'payments');
  if (!guard.ok) return guard.response;

  try {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    auditApiLog('payment_create_entry', { result: 'unauthorized' });
    return json(tournamentApiErrorPayload('UNAUTHORIZED'), 401);
  }

  if (isPaidEntryDisabled()) {
    auditApiLog('payment_create_entry', { result: 'kill_switch', user: shortId(userId) });
    return json(
      { error: 'Paid entry is temporarily unavailable.', code: 'paid_entry_disabled' },
      503
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(tournamentApiErrorPayload('INVALID_JSON'), 400);
  }

  const tournamentId = String(body.tournament_id ?? '').trim();
  if (!tournamentId) {
    return json(tournamentApiErrorPayload('TOURNAMENT_ID_REQUIRED'), 400);
  }

  const supabase = createServiceRoleClient();

  try {
    const decision = await resolveEligibilityDecisionForUser(supabase, userId);
    enforceTournamentRegistration(decision);

    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, ecosystem_scope, status, entry_fee_cents, name')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tErr || !tournament) {
      auditApiLog('payment_create_entry', { result: 'tournament_not_found', tournament_id: shortId(tournamentId) });
      return json(tournamentApiErrorPayload('TOURNAMENT_NOT_FOUND'), 404);
    }

    if (String(tournament.ecosystem_scope ?? 'adult') === 'k12') {
      auditApiLog('payment_create_entry', { result: 'k12_blocked', tournament_id: shortId(tournamentId) });
      return json(tournamentApiErrorPayload('TOURNAMENT_ENTRY_NOT_ALLOWED'), 403);
    }

    const fee = tournament.entry_fee_cents;
    if (fee == null || fee <= 0) {
      return json(tournamentApiErrorPayload('TOURNAMENT_NOT_JOINABLE'), 400);
    }

    const st = String(tournament.status ?? '').toLowerCase();
    if (st === 'completed') {
      return json(tournamentApiErrorPayload('TOURNAMENT_NOT_JOINABLE'), 400);
    }
    if (st !== 'pending') {
      return json(tournamentApiErrorPayload('TOURNAMENT_NOT_JOINABLE'), 400);
    }

    const registration = await checkTournamentRegistrationOpen(supabase, tournamentId);
    if (!registration.open) {
      const status = registration.code === 'MATCH_COUNT_FAILED' ? 502 : 400;
      auditApiLog('payment_create_entry', {
        result: 'registration_closed',
        tournament_id: shortId(tournamentId),
        code: registration.code,
      });
      return json(tournamentApiErrorPayload(registration.code), status);
    }

    const { data: existingEntry } = await supabase
      .from('tournament_entries')
      .select('user_id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingEntry) {
      return json({ error: 'Already registered for this tournament.' }, 409);
    }

    const { data: pendingRow } = await supabase
      .from('payment_transactions')
      .select('id, provider_payment_id')
      .eq('user_id', userId)
      .eq('tournament_id', tournamentId)
      .eq('type', 'entry')
      .eq('status', 'pending')
      .maybeSingle();

    if (pendingRow?.id) {
      auditApiLog('payment_create_entry', { result: 'pending_exists', user: shortId(userId) });
      return json(
        {
          error: 'A payment is already in progress for this tournament.',
          transaction_id: pendingRow.id,
        },
        409
      );
    }

    const provider = await getPaymentProvider();

    const { data: inserted, error: insErr } = await supabase
      .from('payment_transactions')
      .insert({
        user_id: userId,
        tournament_id: tournamentId,
        amount_cents: fee,
        currency: 'usd',
        type: 'entry',
        status: 'pending',
        provider: provider.name,
        metadata: { tournament_name: tournament.name ?? null },
      })
      .select('id')
      .single();

    if (insErr || !inserted?.id) {
      if (/duplicate key|unique constraint/i.test(insErr?.message ?? '')) {
        return json({ error: 'A payment is already in progress for this tournament.' }, 409);
      }
      auditApiLog('payment_create_entry', { result: 'insert_failed', detail: insErr?.message });
      return json({ error: 'Could not create payment record.' }, 503);
    }

    const txId = inserted.id;

    const pi = await provider.createPaymentIntent({
      amountCents: fee,
      currency: 'usd',
      metadata: {
        accl_transaction_id: txId,
        tournament_id: tournamentId,
        user_id: userId,
      },
      idempotencyKey: `accl-entry-${txId}`,
    });

    const { error: updErr } = await supabase
      .from('payment_transactions')
      .update({
        provider: pi.provider,
        provider_payment_id: pi.providerPaymentId,
        updated_at: new Date().toISOString(),
        metadata: {
          tournament_name: tournament.name ?? null,
          provider: pi.provider,
          provider_payment_id: pi.providerPaymentId,
        },
      })
      .eq('id', txId);

    if (updErr) {
      auditApiLog('payment_create_entry', { result: 'update_provider_failed', detail: updErr.message });
      return json({ error: 'Payment intent created but ledger update failed.' }, 503);
    }

    auditApiLog('payment_create_entry', {
      result: 'ok',
      tournament_id: shortId(tournamentId),
      user: shortId(userId),
      transaction: shortId(txId),
    });

    void evaluateAbnormalEntryPattern(supabase, userId).catch(() => {});

    return json({
      transaction_id: txId,
      client_secret: pi.clientSecret,
      amount_cents: fee,
      currency: 'usd',
      provider: pi.provider,
    });
  } catch (e) {
    if (e instanceof EligibilityEnforcementError) {
      auditApiLog('payment_create_entry', {
        result: 'eligibility_denied',
        code: e.code,
        user: shortId(userId),
      });
      return json({ ...tournamentApiErrorPayload(e.code, e.message), eligibility: e.decision }, 403);
    }
    const message = e instanceof Error ? e.message : 'Payment creation failed';
    auditApiLog('payment_create_entry', { result: 'error', detail: message });
    return json(tournamentApiErrorPayload('UNEXPECTED_ERROR', message), 503);
  }
  } finally {
    guard.release();
  }
}
