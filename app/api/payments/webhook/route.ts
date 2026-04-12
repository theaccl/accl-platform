import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { getPaymentProvider } from '@/lib/payments/paymentProvider';
import type { FinancialWebhookResult } from '@/lib/payments/paymentProvider';
import { registerAndExecuteFinancialWebhook } from '@/lib/payments/webhookProcessing';
import { enqueueTask } from '@/lib/queue/simpleQueue';
import { guardRequest } from '@/lib/server/requestGuard';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Stripe / provider webhooks — raw body required for signature verification.
 * Acknowledges quickly (200) after verify; financial work runs in-process queue with retries.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'payments_webhook');
  if (!guard.ok) return guard.response;

  try {
    const raw = Buffer.from(await request.arrayBuffer());

    const sig =
      request.headers.get('stripe-signature') ??
      request.headers.get('Stripe-Signature') ??
      request.headers.get('x-stripe-signature');

    let provider;
    try {
      provider = await getPaymentProvider();
    } catch (e) {
      auditApiLog('payment_webhook', { result: 'provider_error', detail: e instanceof Error ? e.message : 'unknown' });
      return json({ error: 'provider_unavailable' }, 503);
    }

    let parsed: FinancialWebhookResult;
    try {
      parsed = provider.parseIncomingWebhook(raw, sig);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'verify_failed';
      auditApiLog('payment_webhook', { result: 'verify_failed', detail: msg });
      return json({ error: 'invalid_payload' }, 400);
    }

    if (parsed.kind === 'ignored') {
      auditApiLog('payment_webhook', { result: 'ignored', event: parsed.detail });
      return new Response(null, { status: 200 });
    }

    const supabase = createServiceRoleClient();
    enqueueTask(
      'webhook_financial',
      () => registerAndExecuteFinancialWebhook(supabase, parsed),
      { maxAttempts: 5 }
    );

    auditApiLog('payment_webhook', { result: 'accepted', event: shortId(parsed.eventId), kind: parsed.kind });
    return new Response(null, { status: 200 });
  } finally {
    guard.release();
  }
}
