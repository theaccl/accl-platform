import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { configuredProCheckout, PRO_ENTITLEMENT } from '../../lib/payments/proSubscription';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260830214500_pro_billing_image_generator_entitlement.sql'
);
const anniversaryMigrationPath = join(
  process.cwd(),
  'supabase/migrations/20260831173500_pro_anniversary_token_issuance.sql'
);
const compatibilityMigrationPath = join(
  process.cwd(),
  'supabase/migrations/20260831180500_legacy_pro_subscription_sync_compatibility.sql'
);

test('Pro checkout accepts only controlled-launch Stripe test configuration', () => {
  expect(PRO_ENTITLEMENT).toBe('image_generator');
  expect(configuredProCheckout({})).toBeNull();
  expect(
    configuredProCheckout({
      STRIPE_SECRET_KEY: 'sk_live_not_allowed',
      STRIPE_PRO_PRICE_ID: 'price_pro',
      NEXT_PUBLIC_APP_URL: 'https://accl.example',
    })
  ).toBeNull();
  expect(
    configuredProCheckout({
      STRIPE_SECRET_KEY: 'sk_test_allowed',
      STRIPE_PRO_PRICE_ID: 'price_pro',
      NEXT_PUBLIC_APP_URL: 'https://accl.example',
    })
  ).toMatchObject({ proPriceId: 'price_pro', appUrl: 'https://accl.example' });
  expect(
    configuredProCheckout({
      STRIPE_SECRET_KEY: 'sk_test_allowed',
      STRIPE_PRO_PRICE_ID: 'price_pro',
      VERCEL_URL: 'accl-preview.vercel.app',
    })
  ).toMatchObject({ proPriceId: 'price_pro', appUrl: 'https://accl-preview.vercel.app' });
});

test('subscription sync is atomic, idempotent, ordered, and service-only', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  expect(sql).toContain('create table public.billing_subscriptions');
  expect(sql).toContain('create table public.billing_subscription_webhook_events');
  expect(sql).toContain('create or replace function public.sync_pro_subscription_entitlement');
  expect(sql).toContain('on conflict (provider_event_id) do nothing');
  expect(sql).toContain('excluded.last_provider_event_at >= public.billing_subscriptions.last_provider_event_at');
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain("'image_generator'");
  expect(sql).toContain("case when v_has_access then 'active' else 'revoked' end");
  expect(sql).toMatch(/revoke all on function public\.sync_pro_subscription_entitlement[\s\S]*from public, anon, authenticated/i);
  expect(sql).toMatch(/grant execute on function public\.sync_pro_subscription_entitlement[\s\S]*to service_role/i);
});

test('webhook route processes subscription access before acknowledging Stripe', async () => {
  const route = await readFile(join(process.cwd(), 'app/api/payments/webhook/route.ts'), 'utf8');
  const parser = await readFile(join(process.cwd(), 'lib/payments/paymentProvider.ts'), 'utf8');
  expect(route).toContain("parsed.kind === 'pro_subscription_changed'");
  expect(route).toContain('await executeProSubscriptionChanged');
  expect(parser).toContain("case 'customer.subscription.created'");
  expect(parser).toContain("case 'customer.subscription.updated'");
  expect(parser).toContain("case 'customer.subscription.deleted'");
  expect(parser).toContain('item.price.id === proPriceId');
  expect(parser).toContain('subscription.start_date');
  expect(parser).toContain("detail: 'subscription_start_missing'");
  expect(parser).toContain('stripe.webhooks.constructEvent');
});

test('Pro anniversary timing is provider-authoritative and due grants are idempotent', async () => {
  const sql = await readFile(anniversaryMigrationPath, 'utf8');
  const processor = await readFile(
    join(process.cwd(), 'app/api/internal/image-generation/process/route.ts'),
    'utf8'
  );
  const webhook = await readFile(join(process.cwd(), 'lib/payments/webhookProcessing.ts'), 'utf8');

  expect(sql).toContain('add column subscription_started_at timestamptz');
  expect(sql).toContain('create or replace function public.mint_due_pro_anniversary_generation_tokens');
  expect(sql).toContain("'pro_anniversary_mint'");
  expect(sql).toContain("'pro-anniversary:' || p_user_id::text");
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain('row_number() over');
  expect(sql).toContain('subscription_rank = 1');
  expect(sql).toMatch(/revoke all on function public\.mint_due_pro_anniversary_generation_tokens[\s\S]*from public, anon, authenticated/i);
  expect(sql).toMatch(/grant execute on function public\.mint_due_pro_anniversary_generation_tokens[\s\S]*to service_role/i);
  expect(processor).toContain("rpc('mint_due_pro_anniversary_generation_tokens'");
  expect(processor.indexOf("rpc('mint_due_pro_anniversary_generation_tokens'")).toBeLessThan(
    processor.indexOf('configuredImageGenerationProvider()')
  );
  expect(webhook).toContain('p_subscription_started_at: parsed.subscriptionStartedAt');
});

test('migration-first rollout preserves legacy entitlement sync without inferring an anniversary', async () => {
  const sql = await readFile(compatibilityMigrationPath, 'utf8');

  expect(sql).toContain('create or replace function public.sync_pro_subscription_entitlement');
  expect(sql).toContain("'subscription_start_pending', true");
  expect(sql).not.toContain('subscription_started_at = p_provider_created_at');
  expect(sql).not.toContain('mint_pro_anniversary_generation_tokens');
  expect(sql).toMatch(/revoke all on function public\.sync_pro_subscription_entitlement[\s\S]*from public, anon, authenticated/i);
  expect(sql).toMatch(/grant execute on function public\.sync_pro_subscription_entitlement[\s\S]*to service_role/i);
});
