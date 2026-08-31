import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import {
  enforceImageGenerationCostGuard,
  recordPlacementDerivativeCost,
  recordProviderGenerationCost,
} from '../../lib/imageGenerator/costAccounting';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260831165125_image_generation_cost_controls.sql'
);

function rpcRecorder(responses: Array<{ data: unknown; error: { message: string } | null }>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return responses.shift() ?? { data: null, error: null };
      },
    },
  };
}

test('cost migration creates immutable server-only receipts and emergency controls', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
  expect(sql).toContain('create table public.image_generation_operator_controls');
  expect(sql).toContain('create table public.image_generation_cost_events');
  expect(sql).toContain('alter table public.image_generation_cost_events enable row level security');
  expect(sql).toContain('revoke all on public.image_generation_cost_events from public, anon, authenticated');
  expect(sql).not.toContain('grant select on public.image_generation_cost_events to authenticated');
  expect(sql).toContain('revoke all on public.image_generation_cost_events from service_role');
  expect(sql).toContain('grant select on public.image_generation_cost_events to service_role');
  expect(sql).toContain('image_generation_cost_events_deny_client_access');
  expect(sql).toContain('image_generation_operator_controls_deny_client_access');
});

test('cost guard enforces global switch, bounded attempts, known spend, and unknown receipts', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
  expect(sql).toContain('not v_controls.generation_enabled');
  expect(sql).toContain('p_attempt_number > v_controls.max_attempts_per_job');
  expect(sql).toContain('v_known_cost >= v_controls.max_provider_cost_usd_per_commission');
  expect(sql).toContain('v_unpriced_events > 0');
  expect(sql).toContain('max_unpriced_provider_events_per_commission');
  expect(sql).toContain('v_event.provider_cost_usd is distinct from p_provider_cost_usd');
  expect(sql).toContain("v_event.metadata <> coalesce(p_metadata, '{}'::jsonb)");
});

test('cost indexes cover commission, refinement, and owner foreign-key lookups', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
  expect(sql).toContain('image_generation_cost_events_request_idx');
  expect(sql).toContain('image_generation_cost_events_refinement_idx');
  expect(sql).toContain('where refinement_id is not null');
  expect(sql).toContain('image_generation_cost_events_owner_idx');
  expect(sql).toContain('(owner_id, created_at desc)');
});

test('operator controls expose only read and bounded tuning privileges to the service role', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
  expect(sql).toContain('revoke all on public.image_generation_operator_controls from service_role');
  expect(sql).toContain('grant select on public.image_generation_operator_controls to service_role');
  expect(sql).toContain('grant update (');
  expect(sql).not.toContain('grant insert');
  expect(sql).not.toContain('grant delete');
});

test('worker cost calls are server-authored and idempotent per attempt', async () => {
  const fake = rpcRecorder([
    { data: { allowed: true }, error: null },
    { data: { id: 10 }, error: null },
  ]);
  await enforceImageGenerationCostGuard(fake.client as never, {
    requestId: 'request-1',
    attemptNumber: 2,
  });
  await recordProviderGenerationCost(fake.client as never, {
    requestId: 'request-1',
    operation: 'opening',
    attemptNumber: 2,
    provider: { name: 'gateway', model: 'provider/model', generate: async () => ({ images: [], receipt: {} as never }) },
    generatedImageCount: 4,
    outputBytes: 8192,
    receipt: {
      inputTokens: 12,
      outputTokens: 34,
      totalTokens: 46,
      providerCostUsd: 0.25,
      providerCallCount: 4,
      measuredDurationMs: 500,
    },
  });

  expect(fake.calls[0]).toMatchObject({
    name: 'enforce_image_generation_cost_guard',
    args: { p_request_id: 'request-1', p_attempt_number: 2 },
  });
  expect(fake.calls[1]).toMatchObject({
    name: 'record_image_generation_cost_event',
    args: {
      p_request_id: 'request-1',
      p_event_type: 'provider_generation',
      p_operation: 'opening',
      p_provider_cost_usd: 0.25,
      p_output_bytes: 8192,
      p_idempotency_key: 'provider:request-1:opening:opening:attempt-2',
      p_metadata: { provider_call_count: 4, partial_failure: false },
    },
  });
});

test('placement derivative work is measured against its owning commission', async () => {
  const fake = rpcRecorder([{ data: { id: 11 }, error: null }]);
  await recordPlacementDerivativeCost(fake.client as never, {
    requestId: 'request-2',
    candidateId: 'candidate-3',
    surface: 'profile_background',
    derivativeVersion: 'placement.v1',
    runId: 'run-4',
    measuredDurationMs: 75,
    outputBytes: 4096,
  });
  expect(fake.calls[0]).toMatchObject({
    name: 'record_image_generation_cost_event',
    args: {
      p_request_id: 'request-2',
      p_event_type: 'derivative_compute',
      p_operation: 'placement_derivative',
      p_measured_duration_ms: 75,
      p_output_bytes: 4096,
    },
  });
});

test('cost guard and receipt failures stop processing instead of silently losing audits', async () => {
  const denied = rpcRecorder([{ data: null, error: { message: 'ceiling reached' } }]);
  await expect(
    enforceImageGenerationCostGuard(denied.client as never, {
      requestId: 'request-5',
      attemptNumber: 1,
    })
  ).rejects.toThrow('cost_guard_failed:ceiling reached');

  const auditFailure = rpcRecorder([{ data: null, error: { message: 'write failed' } }]);
  await expect(
    recordPlacementDerivativeCost(auditFailure.client as never, {
      requestId: 'request-5',
      candidateId: 'candidate-6',
      surface: 'profile_image',
      derivativeVersion: 'placement.v1',
      runId: 'run-7',
      measuredDurationMs: 20,
      outputBytes: 1024,
    })
  ).rejects.toThrow('derivative_cost_receipt_failed:write failed');
});
