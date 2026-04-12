/**
 * Payment provider abstraction — no tournament or gameplay imports.
 * Concrete provider (Stripe) is wired via env; stubs used when keys are absent (dev).
 */
import type Stripe from 'stripe';

export type CreatePaymentIntentInput = {
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
  idempotencyKey?: string;
};

export type CreatePaymentIntentResult = {
  provider: string;
  providerPaymentId: string;
  clientSecret: string | null;
  raw?: unknown;
};

/** Stripe webhook routing — financial layer only; tournaments unchanged. */
export type FinancialWebhookResult =
  | { kind: 'ignored'; eventId: string; detail: string }
  | {
      kind: 'payment_succeeded';
      eventId: string;
      providerPaymentId: string;
      metadata: Record<string, string>;
    }
  | { kind: 'payment_intent_failed'; eventId: string; paymentIntentId: string }
  | { kind: 'charge_dispute_created'; eventId: string; paymentIntentId: string | null }
  | { kind: 'charge_refunded'; eventId: string; paymentIntentId: string | null };

export type IncomingWebhookResult = FinancialWebhookResult;

export type PayoutTransferInput = {
  amountCents: number;
  currency: string;
  destinationConnectAccountId?: string;
  metadata: Record<string, string>;
  idempotencyKey?: string;
};

export type PayoutTransferResult = {
  provider: string;
  transferId: string | null;
  status: 'completed' | 'pending' | 'stub';
  raw?: unknown;
};

export type PayoutTransferResultWithRetry = PayoutTransferResult & { attempts: number; lastError?: string };

export async function createPayoutTransferWithRetry(
  provider: PaymentProvider,
  input: PayoutTransferInput,
  opts?: { maxAttempts?: number }
): Promise<PayoutTransferResultWithRetry> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await provider.createPayoutTransfer(input);
      return { ...r, attempts: attempt };
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'unknown';
      if (attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, 400 * attempt));
      }
    }
  }
  return {
    provider: provider.name,
    transferId: null,
    status: 'pending',
    attempts: maxAttempts,
    lastError,
  };
}

export interface PaymentProvider {
  readonly name: string;
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult>;
  /** Verify signature; ignored kinds are acknowledged without ledger updates (idempotent). */
  parseIncomingWebhook(payload: Buffer | string, signatureHeader: string | null): IncomingWebhookResult;
  createPayoutTransfer(input: PayoutTransferInput): Promise<PayoutTransferResult>;
  createRefund?(params: { providerPaymentId: string; amountCents?: number }): Promise<{ status: string }>;
}

function stubProvider(): PaymentProvider {
  return {
    name: 'stub',
    async createPaymentIntent(input) {
      const id = `stub_pi_${Date.now()}`;
      return {
        provider: 'stub',
        providerPaymentId: id,
        clientSecret: `stub_secret_${id}`,
        raw: { stub: true, input },
      };
    },
    parseIncomingWebhook(payload) {
      const s = typeof payload === 'string' ? payload : payload.toString('utf8');
      let data: {
        event_id?: string;
        type?: string;
        metadata?: Record<string, string>;
        id?: string;
        payment_intent?: string;
      };
      try {
        data = JSON.parse(s) as typeof data;
      } catch {
        throw new Error('invalid_webhook_payload');
      }
      const t = data.type ?? '';
      if (t === 'payment_intent.payment_failed' && data.id) {
        return {
          kind: 'payment_intent_failed',
          eventId: data.event_id ?? 'stub_evt',
          paymentIntentId: String(data.id),
        };
      }
      if (t === 'charge.dispute.created') {
        return {
          kind: 'charge_dispute_created',
          eventId: data.event_id ?? 'stub_evt',
          paymentIntentId: data.payment_intent ? String(data.payment_intent) : null,
        };
      }
      if (t === 'charge.refunded') {
        return {
          kind: 'charge_refunded',
          eventId: data.event_id ?? 'stub_evt',
          paymentIntentId: data.payment_intent ? String(data.payment_intent) : null,
        };
      }
      if (t && t !== 'payment_intent.succeeded') {
        return { kind: 'ignored', eventId: data.event_id ?? 'stub_evt', detail: t };
      }
      const id = data.id ?? data.metadata?.accl_transaction_id ?? '';
      if (!id) throw new Error('missing_payment_intent');
      return {
        kind: 'payment_succeeded',
        eventId: data.event_id ?? 'stub_evt',
        providerPaymentId: String(data.metadata?.provider_payment_id ?? data.id ?? 'stub'),
        metadata: data.metadata ?? {},
      };
    },
    async createPayoutTransfer() {
      return { provider: 'stub', transferId: null, status: 'stub' };
    },
  };
}

async function loadStripeProvider(): Promise<PaymentProvider> {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (secret?.startsWith('sk_live_')) {
    console.error(
      '[accl] STRIPE_SECRET_KEY is live mode — blocked for controlled launch; use sk_test_ only or omit keys for stub.'
    );
    return stubProvider();
  }
  if (!secret || !webhookSecret) {
    return stubProvider();
  }
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secret);
  return {
    name: 'stripe',
    async createPaymentIntent(input) {
      const pi = await stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency,
          metadata: input.metadata,
          automatic_payment_methods: { enabled: true },
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
      );
      return {
        provider: 'stripe',
        providerPaymentId: pi.id,
        clientSecret: pi.client_secret,
        raw: pi,
      };
    },
    parseIncomingWebhook(payload, signatureHeader) {
      if (!signatureHeader) throw new Error('missing_signature');
      const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
      const event = stripe.webhooks.constructEvent(buf, signatureHeader, webhookSecret);
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent;
          const meta: Record<string, string> = {};
          if (pi.metadata) {
            for (const [k, v] of Object.entries(pi.metadata)) {
              if (v != null) meta[k] = String(v);
            }
          }
          return {
            kind: 'payment_succeeded',
            eventId: event.id,
            providerPaymentId: pi.id,
            metadata: meta,
          };
        }
        case 'payment_intent.payment_failed': {
          const pi = event.data.object as Stripe.PaymentIntent;
          return {
            kind: 'payment_intent_failed',
            eventId: event.id,
            paymentIntentId: pi.id,
          };
        }
        case 'charge.dispute.created': {
          const dispute = event.data.object as Stripe.Dispute;
          const piId =
            typeof dispute.payment_intent === 'string'
              ? dispute.payment_intent
              : dispute.payment_intent?.id ?? null;
          return {
            kind: 'charge_dispute_created',
            eventId: event.id,
            paymentIntentId: piId,
          };
        }
        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          const piId =
            typeof charge.payment_intent === 'string'
              ? charge.payment_intent
              : charge.payment_intent?.id ?? null;
          return {
            kind: 'charge_refunded',
            eventId: event.id,
            paymentIntentId: piId,
          };
        }
        default:
          return { kind: 'ignored', eventId: event.id, detail: event.type };
      }
    },
    async createPayoutTransfer(input) {
      if (!input.destinationConnectAccountId) {
        return { provider: 'stripe', transferId: null, status: 'pending', raw: { reason: 'no_connect_account' } };
      }
      const t = await stripe.transfers.create({
        amount: input.amountCents,
        currency: input.currency,
        destination: input.destinationConnectAccountId,
        metadata: input.metadata,
      });
      return { provider: 'stripe', transferId: t.id, status: 'completed', raw: t };
    },
    async createRefund(params) {
      await stripe.refunds.create({ payment_intent: params.providerPaymentId });
      return { status: 'ok' };
    },
  };
}

let cached: PaymentProvider | null = null;

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (cached) return cached;
  cached = await loadStripeProvider();
  return cached;
}

export function resetPaymentProviderCacheForTests(): void {
  cached = null;
}
