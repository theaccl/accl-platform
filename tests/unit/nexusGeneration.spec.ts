import { test, expect } from '@playwright/test';

import { runNexusAdvisoryGeneration } from '../../lib/nexus/generation';
import {
  InMemoryNexusOutputRegistryRepo,
  NexusOutputRegistryService,
} from '../../lib/nexus/outputRegistry';
import type { NexusAdapterOutput } from '../../lib/nexus/adapters';

function makeInput(envelope: NexusAdapterOutput['envelope']): NexusAdapterOutput {
  return {
    envelope,
    source_refs: [{ source_type: envelope.source_type, source_id: envelope.source_id }],
    read_path: 'unit-test',
  };
}

test.describe('NEXUS Phase 5 advisory generation pipeline', () => {
  test('safe inputs generate valid advisory outputs and persist to registry', async () => {
    const repo = new InMemoryNexusOutputRegistryRepo();
    const registry = new NexusOutputRegistryService(repo);

    const inputs: NexusAdapterOutput[] = [
      makeInput({
        source_type: 'moderation_safe_operational_summary',
        source_id: 'ops-1',
        payload: {
          queue_counts: { failed: 2, bot_no_moves_logged: 1 },
          stale_counts: { running_stale: 1, trainer_partial: 1 },
        },
      }),
      makeInput({
        source_type: 'config_env_health_state',
        source_id: 'env-1',
        payload: {
          has_errors: true,
          states: [{ key: 'BOT_USER_ID_CARDI', ok: false, category: 'missing_profile', detail: 'not found' }],
        },
      }),
    ];

    const generated = await runNexusAdvisoryGeneration({
      adapter_inputs: inputs,
      registry,
      options: { now_iso: '2026-04-09T20:00:00.000Z' },
    });

    expect(generated.stats.generated).toBeGreaterThan(0);
    expect(generated.generated_records.length).toBe(generated.stats.generated);
    expect(generated.generated_records.every((r) => r.model_version === 'nexus-rules-v1')).toBe(true);
    expect(generated.generated_records.every((r) => r.policy_version === 'nexus-policy-1')).toBe(true);
    expect(generated.generated_records.every((r) => Array.isArray(r.source_refs) && r.source_refs.length > 0)).toBe(
      true
    );
  });

  test('repeated same-condition inputs are deduped/suppressed in window', async () => {
    const repo = new InMemoryNexusOutputRegistryRepo();
    const registry = new NexusOutputRegistryService(repo);
    const input = makeInput({
      source_type: 'moderation_safe_operational_summary',
      source_id: 'ops-dedupe',
      payload: {
        queue_counts: { failed: 1 },
        stale_counts: { running_stale: 1 },
      },
    });

    const first = await runNexusAdvisoryGeneration({
      adapter_inputs: [input],
      registry,
      options: { now_iso: '2026-04-09T20:00:00.000Z', dedupe_window_seconds: 3600 },
    });
    const second = await runNexusAdvisoryGeneration({
      adapter_inputs: [input],
      registry,
      options: { now_iso: '2026-04-09T20:10:00.000Z', dedupe_window_seconds: 3600 },
    });

    expect(first.stats.generated).toBeGreaterThan(0);
    expect(second.stats.suppressed).toBeGreaterThan(0);
    expect(second.stats.generated).toBe(0);
  });

  test('invalid candidates fail closed and are not persisted', async () => {
    const repo = new InMemoryNexusOutputRegistryRepo();
    const registry = new NexusOutputRegistryService(repo);

    const unsafeInput = makeInput({
      source_type: 'moderation_safe_operational_summary',
      source_id: 'ops-unsafe',
      payload: {
        queue_counts: { failed: 1 },
        authorization: 'Bearer token',
      },
    });

    const result = await runNexusAdvisoryGeneration({
      adapter_inputs: [unsafeInput],
      registry,
      options: { now_iso: '2026-04-09T20:00:00.000Z' },
    });

    expect(result.stats.generated).toBe(0);
    expect(result.stats.rejected_inputs).toBe(1);
    expect(result.rejected[0]?.stage).toBe('input');
  });

  test('forbidden data does not enter generated outputs', async () => {
    const repo = new InMemoryNexusOutputRegistryRepo();
    const registry = new NexusOutputRegistryService(repo);
    const safeInput = makeInput({
      source_type: 'moderation_safe_operational_summary',
      source_id: 'ops-safe',
      payload: {
        queue_counts: { failed: 1 },
      },
    });

    const result = await runNexusAdvisoryGeneration({
      adapter_inputs: [safeInput],
      registry,
      options: { now_iso: '2026-04-09T20:00:00.000Z' },
    });
    expect(result.stats.generated).toBeGreaterThan(0);
    const text = JSON.stringify(result.generated_records);
    expect(text.toLowerCase()).not.toContain('fen');
    expect(text.toLowerCase()).not.toContain('bestmove');
    expect(text.toLowerCase()).not.toContain('authorization');
    expect(text.toLowerCase()).not.toContain('access_token');
  });
});

