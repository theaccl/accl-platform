import Stripe from 'stripe';

export const PRO_ENTITLEMENT = 'image_generator';

export type ProCheckoutConfig = {
  stripeSecretKey: string;
  proPriceId: string;
  appUrl: string;
};

export function configuredProCheckout(environment: Record<string, string | undefined> = process.env): ProCheckoutConfig | null {
  const stripeSecretKey = environment.STRIPE_SECRET_KEY?.trim() ?? '';
  const proPriceId = environment.STRIPE_PRO_PRICE_ID?.trim() ?? '';
  const configuredAppUrl = environment.NEXT_PUBLIC_APP_URL?.trim() ?? '';
  const vercelUrl = environment.VERCEL_URL?.trim() ?? '';
  const appUrl = configuredAppUrl || (vercelUrl ? `https://${vercelUrl}` : '');
  if (!stripeSecretKey.startsWith('sk_test_') || !proPriceId.startsWith('price_') || !appUrl) return null;
  try {
    const url = new URL(appUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
    return { stripeSecretKey, proPriceId, appUrl: url.origin };
  } catch {
    return null;
  }
}

export async function createProCheckoutSession(input: {
  userId: string;
  email?: string;
  config?: ProCheckoutConfig;
}): Promise<{ id: string; url: string }> {
  const config = input.config ?? configuredProCheckout();
  if (!config) throw new Error('pro_checkout_not_configured');
  const stripe = new Stripe(config.stripeSecretKey);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: config.proPriceId, quantity: 1 }],
    client_reference_id: input.userId,
    customer_email: input.email,
    metadata: {
      accl_user_id: input.userId,
      accl_plan: 'pro',
      accl_entitlement: PRO_ENTITLEMENT,
    },
    subscription_data: {
      metadata: {
        accl_user_id: input.userId,
        accl_plan: 'pro',
        accl_entitlement: PRO_ENTITLEMENT,
      },
    },
    success_url: `${config.appUrl}/profile?pro=activated`,
    cancel_url: `${config.appUrl}/profile?pro=cancelled`,
  });
  if (!session.url) throw new Error('pro_checkout_url_missing');
  return { id: session.id, url: session.url };
}
