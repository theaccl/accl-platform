import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import {
  imageGenerationRetryDelaySeconds,
  isTransientImageGenerationError,
} from '../../lib/imageGenerator/worker';

async function source(path: string): Promise<string> {
  return readFile(join(process.cwd(), path), 'utf8');
}

test('Vercel schedules one bounded image request per minute', async () => {
  const config = JSON.parse(await source('vercel.json')) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  expect(config.crons).toContainEqual({
    path: '/api/internal/image-generation/process?batch=1',
    schedule: '* * * * *',
  });
});

test('cron requests use Vercel bearer authentication and a GET handler', async () => {
  const auth = await source('lib/imageGenerator/internalAuth.ts');
  const route = await source('app/api/internal/image-generation/process/route.ts');
  expect(auth).toContain('CRON_SECRET');
  expect(auth).toContain('Bearer ${cronSecret}');
  expect(route).toContain('export async function GET');
  expect(route).toContain('recover_stale_image_generation_requests');
  expect(route).toContain("rpc('expire_due_image_generation_reviews'");
});

test('maintenance and stale-token refunds run before provider availability is checked', async () => {
  const route = await source('app/api/internal/image-generation/process/route.ts');
  const providerCheck = route.indexOf('configuredImageGenerationProvider()');
  expect(route.indexOf("rpc('recover_stale_image_generation_requests'")).toBeLessThan(providerCheck);
  expect(route.indexOf("p_action: 'refund'")).toBeLessThan(providerCheck);
  expect(route.indexOf("rpc('expire_due_image_generation_reviews'")).toBeLessThan(providerCheck);
});

test('review expiry migration is bounded, concurrency-safe, and service-only', async () => {
  const sql = (await source(
    'supabase/migrations/20260831190000_image_generation_review_expiry_recovery.sql'
  )).toLowerCase();
  expect(sql).toContain("where status = 'review'");
  expect(sql).toContain('for update of r skip locked');
  expect(sql).toContain("status = 'cancelled'");
  expect(sql).toContain("status = 'expired'");
  expect(sql).toContain('review_expires_at > now()');
  expect(sql).toContain('to service_role');
  expect(sql).toContain('from public, anon, authenticated');
  expect(sql).not.toContain('storage.objects');
});

test('transient provider failures use bounded exponential retries', () => {
  expect(isTransientImageGenerationError(new Error('fetch failed'))).toBe(true);
  expect(isTransientImageGenerationError(new Error('provider returned 503'))).toBe(true);
  expect(isTransientImageGenerationError(new Error('cost_receipt_failed: network timeout'))).toBe(false);
  expect(isTransientImageGenerationError(new Error('provider_candidate_mime_invalid'))).toBe(false);
  expect(imageGenerationRetryDelaySeconds(1)).toBe(30);
  expect(imageGenerationRetryDelaySeconds(2)).toBe(60);
  expect(imageGenerationRetryDelaySeconds(3)).toBe(120);
});

test('opening and refinement calls send trusted Gateway cost-attribution dimensions', async () => {
  const worker = await source('lib/imageGenerator/worker.ts');
  const refinementWorker = await source('lib/imageGenerator/refinementWorker.ts');
  expect(worker).toContain('membershipTier: request.membership_tier');
  expect(worker).toContain("operation: 'opening'");
  expect(worker).toContain('attemptNumber: request.attempt_count');
  expect(refinementWorker).toContain('membershipTier: requestResult.data.membership_tier');
  expect(refinementWorker).toContain("operation: 'refinement'");
  expect(refinementWorker).toContain('attemptNumber: refinement.attempt_count');
  expect(refinementWorker).toContain('refinementId: refinement.id');
  expect(worker).toContain('enforceImageGenerationCostGuard');
  expect(worker).toContain('recordProviderGenerationCost');
  expect(refinementWorker).toContain('enforceImageGenerationCostGuard');
  expect(refinementWorker).toContain('recordProviderGenerationCost');
  expect(worker).toContain('caught instanceof ImageGenerationProviderError');
  expect(refinementWorker).toContain('caught instanceof ImageGenerationProviderError');
  expect(worker).toContain('partialFailure: true');
  expect(refinementWorker).toContain('partialFailure: true');
});

test('retry migration enforces due-time claims, three attempts, and stale recovery', async () => {
  const sql = (await source(
    'supabase/migrations/20260830230000_image_generation_worker_retry_schedule.sql'
  )).toLowerCase();
  expect(sql).toContain('next_attempt_at <= now()');
  expect(sql).toContain('attempt_count < 3');
  expect(sql).toContain('retry_or_fail_image_generation_request');
  expect(sql).toContain('recover_stale_image_generation_requests');
  expect(sql).toContain('for update skip locked');
  expect(sql).toContain('to service_role');
});
