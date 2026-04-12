import { test, expect } from '@playwright/test';

import {
  InMemoryNexusOutputRegistryRepo,
  NexusOutputRegistryService,
} from '../../lib/nexus/outputRegistry';
import type { NexusOutputRecord } from '../../lib/nexus/contract';

function makeOutput(overrides: Partial<NexusOutputRecord> = {}): NexusOutputRecord {
  return {
    output_type: 'insight',
    subject_scope: 'player',
    confidence: 0.73,
    source_refs: [{ source_type: 'player_pattern_profile', source_id: 'user-1' }],
    generated_at: new Date().toISOString(),
    model_version: 'nexus-m1',
    policy_version: 'nexus-policy-1',
    content: {
      title: 'Pattern confidence',
      summary: 'Player demonstrates improving tactical pattern consistency.',
    },
    ...overrides,
  };
}

test.describe('NEXUS output registry service', () => {
  test('valid advisory output persists with lineage fields', async () => {
    const repo = new InMemoryNexusOutputRegistryRepo();
    const service = new NexusOutputRegistryService(repo);
    const output = makeOutput({
      source_refs: [
        { source_type: 'finished_game_artifact', source_id: 'artifact-9' },
        { source_type: 'trainer_approved_output', source_id: 'trainer-3' },
      ],
    });

    const stored = await service.writeAdvisoryRecord({
      output,
      subject_id: 'user-1',
    });

    expect(stored.id).toBeTruthy();
    expect(stored.subject_id).toBe('user-1');
    expect(stored.source_refs).toEqual(output.source_refs);
    expect(stored.model_version).toBe(output.model_version);
    expect(stored.policy_version).toBe(output.policy_version);
    expect(stored.generated_at).toBe(output.generated_at);
  });

  test('invalid/unclassified output is rejected fail-closed', async () => {
    const repo = new InMemoryNexusOutputRegistryRepo();
    const service = new NexusOutputRegistryService(repo);

    await expect(
      service.writeAdvisoryRecord({
        output: makeOutput({
          output_type: 'free_text' as unknown as NexusOutputRecord['output_type'],
          source_refs: [],
        }),
      })
    ).rejects.toThrow(/NEXUS_OUTPUT_VALIDATION_FAILED/);
  });

  test('expired output is query-distinguishable from active', async () => {
    const repo = new InMemoryNexusOutputRegistryRepo();
    const service = new NexusOutputRegistryService(repo);

    const now = Date.now();
    const activeExpiry = new Date(now + 60_000).toISOString();
    const expiredAt = new Date(now - 60_000).toISOString();

    await service.writeAdvisoryRecord({
      output: makeOutput({
        output_type: 'warning',
        source_refs: [{ source_type: 'config_env_health_state', source_id: 'env-1' }],
        expires_at: activeExpiry,
      }),
      subject_id: 'system',
    });
    await service.writeAdvisoryRecord({
      output: makeOutput({
        output_type: 'anomaly_flag',
        source_refs: [{ source_type: 'moderation_safe_operational_summary', source_id: 'ops-1' }],
        expires_at: expiredAt,
      }),
      subject_id: 'system',
    });

    const active = await service.listActive();
    const expired = await service.listExpired();
    expect(active.length).toBe(1);
    expect(expired.length).toBe(1);
    expect(active[0]?.expires_at).toBe(activeExpiry);
    expect(expired[0]?.expires_at).toBe(expiredAt);
  });

  test('query helpers filter by scope, subject_id, output_type, and recency', async () => {
    const repo = new InMemoryNexusOutputRegistryRepo();
    const service = new NexusOutputRegistryService(repo);
    const older = new Date(Date.now() - 30_000).toISOString();
    const newer = new Date(Date.now() - 5_000).toISOString();

    await service.writeAdvisoryRecord({
      output: makeOutput({
        output_type: 'recommendation',
        subject_scope: 'game',
        generated_at: older,
        source_refs: [{ source_type: 'finished_game_artifact', source_id: 'artifact-old' }],
      }),
      subject_id: 'game-1',
    });
    await service.writeAdvisoryRecord({
      output: makeOutput({
        output_type: 'insight',
        subject_scope: 'game',
        generated_at: newer,
        source_refs: [{ source_type: 'finished_game_artifact', source_id: 'artifact-new' }],
      }),
      subject_id: 'game-1',
    });

    const byScope = await service.listBySubjectScope('game');
    expect(byScope.length).toBe(2);

    const bySubject = await service.listBySubjectId('game-1');
    expect(bySubject.length).toBe(2);

    const byType = await service.listByOutputType('insight');
    expect(byType.length).toBe(1);
    expect(byType[0]?.output_type).toBe('insight');

    const recent = await service.query({
      subject_scope: 'game',
      generated_after: new Date(Date.now() - 10_000).toISOString(),
    });
    expect(recent.length).toBe(1);
    expect(recent[0]?.generated_at).toBe(newer);
  });
});

