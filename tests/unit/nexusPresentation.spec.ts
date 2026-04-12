import { expect, test } from '@playwright/test';

import { rankAndDedupeAdvisories } from '../../lib/nexus/presentation';
import type { NexusAdvisoryStoredRecord } from '../../lib/nexus/outputRegistry';

function rec(overrides: Partial<NexusAdvisoryStoredRecord>): NexusAdvisoryStoredRecord {
  return {
    id: 'nexus-1',
    output_type: 'insight',
    subject_scope: 'system',
    subject_id: null,
    confidence: 0.8,
    source_refs: [{ source_type: 'moderation_safe_operational_summary', source_id: 'ops-1' }],
    content: { title: 'Base', summary: 'Base summary' },
    model_version: 'nexus-m1',
    policy_version: 'nexus-policy-1',
    generated_at: '2026-04-09T20:00:00.000Z',
    created_at: '2026-04-09T20:00:01.000Z',
    ...overrides,
  };
}

test.describe('NEXUS presentation ranking/expiry/dedupe', () => {
  test('higher priority advisories sort above weaker ones', () => {
    const out = rankAndDedupeAdvisories({
      now_ms: Date.parse('2026-04-10T00:00:00.000Z'),
      rows: [
        rec({ id: 'weak', output_type: 'insight', confidence: 0.45 }),
        rec({ id: 'strong', output_type: 'warning', confidence: 0.9 }),
      ],
      keep_expired: false,
      keep_stale_active: true,
    });
    expect(out[0]?.id).toBe('strong');
    expect((out[0]?.display_priority ?? 0) > (out[1]?.display_priority ?? 0)).toBe(true);
  });

  test('expired filtered and stale demoted when enabled', () => {
    const out = rankAndDedupeAdvisories({
      now_ms: Date.parse('2026-04-10T12:00:00.000Z'),
      stale_after_hours: 12,
      keep_expired: false,
      keep_stale_active: true,
      rows: [
        rec({ id: 'active', generated_at: '2026-04-10T10:00:00.000Z' }),
        rec({
          id: 'stale',
          generated_at: '2026-04-09T20:00:00.000Z',
          content: { title: 'Stale advisory', summary: 'Older signal still active' },
        }),
        rec({
          id: 'expired',
          generated_at: '2026-04-09T22:00:00.000Z',
          expires_at: '2026-04-10T00:00:00.000Z',
        }),
      ],
    });
    expect(out.some((r) => r.id === 'expired')).toBe(false);
    const stale = out.find((r) => r.id === 'stale');
    expect(stale?.presentation_status).toBe('stale_active');
  });

  test('near-duplicate advisories are suppressed', () => {
    const out = rankAndDedupeAdvisories({
      now_ms: Date.parse('2026-04-10T00:00:00.000Z'),
      dedupe_window_hours: 72,
      rows: [
        rec({
          id: 'a1',
          output_type: 'warning',
          content: { title: 'Queue failures 3', summary: 'Queue fail count 3 for system' },
        }),
        rec({
          id: 'a2',
          output_type: 'warning',
          generated_at: '2026-04-09T22:00:00.000Z',
          content: { title: 'Queue failures 4', summary: 'Queue fail count 4 for system' },
        }),
      ],
    });
    expect(out.length).toBe(1);
  });
});

