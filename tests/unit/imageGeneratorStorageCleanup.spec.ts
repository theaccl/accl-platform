import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { processImageGenerationStorageCleanup } from '../../lib/imageGenerator/storageCleanup';

type RpcCall = { name: string; args: Record<string, unknown> };

function cleanupClient(options?: { removeError?: string; finalizeError?: string }) {
  const rpcCalls: RpcCall[] = [];
  const removedPaths: string[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'claim_image_generation_storage_cleanup_jobs') {
        return {
          data: [{
            id: 41,
            bucket: 'image-generation-candidates',
            storage_path: 'owner/request/candidate.png',
            attempt_count: 2,
          }],
          error: null,
        };
      }
      return options?.finalizeError
        ? { data: null, error: { message: options.finalizeError } }
        : { data: true, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removedPaths.push(...paths.map((path) => `${bucket}:${path}`));
          return options?.removeError
            ? { data: null, error: { message: options.removeError } }
            : { data: [], error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, rpcCalls, removedPaths };
}

test('durable cleanup completes an exactly claimed private object', async () => {
  const { client, rpcCalls, removedPaths } = cleanupClient();
  const summary = await processImageGenerationStorageCleanup(client, 500);

  expect(rpcCalls[0]).toEqual({
    name: 'claim_image_generation_storage_cleanup_jobs',
    args: { p_limit: 100, p_stale_after_seconds: 600 },
  });
  expect(removedPaths).toEqual([
    'image-generation-candidates:owner/request/candidate.png',
  ]);
  expect(rpcCalls[1]).toEqual({
    name: 'finalize_image_generation_storage_cleanup_job',
    args: { p_job_id: 41, p_succeeded: true, p_error: null },
  });
  expect(summary).toEqual({
    claimed: 1,
    completed: 1,
    failed: 0,
    claim_error: null,
    finalize_errors: [],
  });
});

test('durable cleanup returns a failed object to the retry schedule', async () => {
  const { client, rpcCalls } = cleanupClient({ removeError: 'temporary storage outage' });
  const summary = await processImageGenerationStorageCleanup(client);

  expect(rpcCalls[1]).toEqual({
    name: 'finalize_image_generation_storage_cleanup_job',
    args: {
      p_job_id: 41,
      p_succeeded: false,
      p_error: 'temporary storage outage',
    },
  });
  expect(summary).toMatchObject({ claimed: 1, completed: 0, failed: 1 });
});

test('durable cleanup reports finalization failures without losing the claimed job', async () => {
  const { client } = cleanupClient({ finalizeError: 'database unavailable' });
  const summary = await processImageGenerationStorageCleanup(client);

  expect(summary.finalize_errors).toEqual(['database unavailable']);
});
