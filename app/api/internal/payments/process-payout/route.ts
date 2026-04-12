import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { verifyInternalPaymentsSecret } from '@/lib/internalPaymentsAuth';
import { processTournamentPayout } from '@/lib/payments/payoutProcessor';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { isPayoutProcessingDisabled } from '@/lib/server/deployReadiness';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Body = { tournament_id?: unknown };

/**
 * Internal-only: triggers payout ledger + provider transfer after tournament completion.
 * Not exposed to browsers; requires `x-accl-internal-payments-secret`.
 */
export async function POST(request: Request): Promise<Response> {
  if (!verifyInternalPaymentsSecret(request)) {
    auditApiLog('internal_process_payout', { result: 'forbidden' });
    return json({ error: 'Forbidden' }, 403);
  }

  if (isPayoutProcessingDisabled()) {
    auditApiLog('internal_process_payout', { result: 'kill_switch' });
    return json({ error: 'Payout processing is disabled.', code: 'payout_disabled' }, 503);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const tournamentId = String(body.tournament_id ?? '').trim();
  if (!tournamentId) {
    return json({ error: 'tournament_id is required' }, 400);
  }

  const supabase = createServiceRoleClient();
  const result = await processTournamentPayout(supabase, tournamentId);

  auditApiLog('internal_process_payout', {
    result: result.ok ? 'ok' : 'failed',
    tournament_id: shortId(tournamentId),
    payouts: result.payouts_created,
    payouts_held: result.payouts_held,
  });

  if (!result.ok) {
    return json(result, 422);
  }
  return json(result, 200);
}
