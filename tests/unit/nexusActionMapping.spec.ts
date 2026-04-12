import { test, expect } from '@playwright/test';

import { mapAdvisoryToEligibleActions } from '../../lib/nexus/actionMapping';
import type { NexusAdvisoryStoredRecord } from '../../lib/nexus/outputRegistry';

function advisory(overrides: Partial<NexusAdvisoryStoredRecord>): NexusAdvisoryStoredRecord {
  return {
    id: 'nexus-1',
    output_type: 'warning',
    subject_scope: 'system',
    subject_id: null,
    confidence: 0.8,
    source_refs: [{ source_type: 'moderation_safe_operational_summary', source_id: 'ops-1' }],
    generated_at: '2026-04-09T20:00:00.000Z',
    model_version: 'nexus-rules-v1',
    policy_version: 'nexus-policy-1',
    created_at: '2026-04-09T20:00:01.000Z',
    content: {
      title: 'Queue Failures Detected',
      summary: '3 queue job(s) currently failed.',
    },
    ...overrides,
  };
}

test.describe('NEXUS advisory action mapping', () => {
  test('queue failure advisories expose only safe retry mapping', () => {
    const actions = mapAdvisoryToEligibleActions(advisory({}));
    expect(actions.some((a) => a.action_type === 'retry_failed_queue_job')).toBe(true);
    expect(actions.some((a) => a.action_type === 'rerun_trainer_generation')).toBe(false);
  });

  test('game-scoped trainer degradation exposes triage + safe rerun', () => {
    const actions = mapAdvisoryToEligibleActions(
      advisory({
        output_type: 'recommendation',
        subject_scope: 'game',
        subject_id: 'game-123',
        content: {
          title: 'Trainer Generation Degradation',
          summary: 'Trainer generation missing for this finished game.',
        },
      })
    );
    expect(actions.some((a) => a.action_type === 'open_triage_page')).toBe(true);
    expect(actions.some((a) => a.action_type === 'rerun_trainer_generation')).toBe(true);
    const bounded = actions.filter(
      (a) => a.action_type === 'rerun_trainer_generation' || a.action_type === 'retry_failed_queue_job'
    );
    for (const action of bounded) {
      expect(action.endpoint).toBe('/api/operator/control-center');
    }
  });

  test('insight advisories expose no action controls', () => {
    const actions = mapAdvisoryToEligibleActions(
      advisory({
        output_type: 'insight',
        content: {
          title: 'Config Health Stable',
          summary: 'Environment checks are healthy.',
        },
      })
    );
    expect(actions).toEqual([]);
  });
});

