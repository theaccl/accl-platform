import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { verifyInternalPaymentsSecret } from '@/lib/internalPaymentsAuth';
import { processRefundForEntryTransaction } from '@/lib/payments/refundService';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { isPayoutProcessingDisabled } from '@/lib/server/deployReadiness';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Body = { transaction_id?: unknown; reason?: unknown; idempotency_key?: unknown };

/**
 * Internal operator refund — idempotent; financial layer only.
 */
export async function POST(request: Request): Promise<Response> {
  if (!verifyInternalPaymentsSecret(request)) {
    auditApiLog('internal_process_refund', { result: 'forbidden' });
    return json({ error: 'Forbidden' }, 403);
  }

  if (isPayoutProcessingDisabled()) {
    auditApiLog('internal_process_refund', { result: 'kill_switch' });
    return json({ error: 'Refund processing is disabled.', code: 'payout_disabled' }, 503);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const transactionId = String(body.transaction_id ?? '').trim();
  const reason = String(body.reason ?? 'operator_refund').trim() || 'operator_refund';
  const idempotencyKey = String(body.idempotency_key ?? request.headers.get('x-idempotency-key') ?? '').trim() || `ir-${Date.now()}`;

  if (!transactionId) {
    return json({ error: 'transaction_id is required' }, 400);
  }

  const supabase = createServiceRoleClient();
  const result = await processRefundForEntryTransaction(supabase, {
    transactionId,
    reason,
    idempotencyKey,
  });

  auditApiLog('internal_process_refund', {
    result: result.ok ? 'ok' : 'failed',
    transaction: shortId(transactionId),
  });

  if (!result.ok) {
    return json(result, 422);
  }
  return json(result, 200);
}
