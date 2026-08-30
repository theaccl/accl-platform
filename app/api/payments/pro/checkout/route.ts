import { createProCheckoutSession } from '@/lib/payments/proSubscription';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { jsonResponse } from '@/lib/server/httpJson';
import { guardRequest } from '@/lib/server/requestGuard';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'payments');
  if (!guard.ok) return guard.response;
  try {
    const user = await resolveAuthenticatedUser(request);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    const { data: existing } = await createServiceRoleClient()
      .from('billing_subscriptions')
      .select('provider_subscription_id')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .limit(1)
      .maybeSingle();
    if (existing) return jsonResponse({ error: 'Pro subscription is already active' }, 409);
    try {
      const checkout = await createProCheckoutSession({ userId: user.id, email: user.email ?? undefined });
      return jsonResponse({ checkout }, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'pro_checkout_not_configured') {
        return jsonResponse({ error: 'Pro checkout is not configured' }, 503);
      }
      return jsonResponse({ error: 'Could not start Pro checkout' }, 502);
    }
  } finally {
    guard.release();
  }
}
