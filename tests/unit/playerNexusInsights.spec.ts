import { expect, test } from '@playwright/test';

import { sanitizePlayerInsights } from '../../lib/nexus/playerInsights';
import type { NexusAdvisoryStoredRecord } from '../../lib/nexus/outputRegistry';

function row(overrides: Partial<NexusAdvisoryStoredRecord>): NexusAdvisoryStoredRecord {
  return {
    id: 'nexus-1',
    output_type: 'insight',
    subject_scope: 'player',
    subject_id: 'user-a',
    confidence: 0.8,
    source_refs: [{ source_type: 'player_pattern_profile', source_id: 'p1' }],
    content: { title: 'Pattern trend', summary: 'You perform better in endgames.' },
    model_version: 'nexus-rules-v1',
    policy_version: 'nexus-policy-1',
    generated_at: '2026-04-09T20:00:00.000Z',
    created_at: '2026-04-09T20:00:01.000Z',
    ...overrides,
  };
}

test.describe('player NEXUS insight safety filters', () => {
  test('returns only player-safe active advisory types', () => {
    const out = sanitizePlayerInsights({
      current_user_id: 'user-a',
      rows: [
        row({ id: 'ok-1', output_type: 'insight' }),
        row({ id: 'ok-2', output_type: 'warning' }),
        row({ id: 'ok-3', output_type: 'recommendation' }),
        row({ id: 'block-1', output_type: 'anomaly_flag' }),
        row({ id: 'block-2', expires_at: '2026-04-09T10:00:00.000Z' }),
      ],
      now_ms: Date.parse('2026-04-09T21:00:00.000Z'),
    });
    expect(out.map((x) => x.id).sort()).toEqual(['ok-1', 'ok-2', 'ok-3']);
    expect(out[0]?.display_priority).toBeGreaterThan(0);
    expect(out[0]?.quality_score).toBeGreaterThan(0);
  });

  test('blocks forbidden payload content', () => {
    const out = sanitizePlayerInsights({
      current_user_id: 'user-a',
      rows: [
        row({ id: 'safe-1' }),
        row({
          id: 'bad-1',
          content: {
            title: 'Move sequence',
            summary: 'Best line contains fen and pv data.',
          },
        }),
      ],
      now_ms: Date.parse('2026-04-09T21:00:00.000Z'),
    });
    expect(out.map((x) => x.id)).toEqual(['safe-1']);
  });

  test('prevents cross-player leakage', () => {
    const out = sanitizePlayerInsights({
      current_user_id: 'user-a',
      rows: [
        row({ id: 'mine-1', subject_id: 'user-a' }),
        row({ id: 'other-1', subject_id: 'user-b' }),
      ],
      now_ms: Date.parse('2026-04-09T21:00:00.000Z'),
    });
    expect(out.map((x) => x.id)).toEqual(['mine-1']);
  });

  test('suppresses near-duplicate advisories in player view', () => {
    const out = sanitizePlayerInsights({
      current_user_id: 'user-a',
      rows: [
        row({
          id: 'dup-1',
          output_type: 'warning',
          content: { title: 'Trainer warning 1', summary: 'Trainer generation lag observed' },
        }),
        row({
          id: 'dup-2',
          output_type: 'warning',
          generated_at: '2026-04-09T20:10:00.000Z',
          content: { title: 'Trainer warning 2', summary: 'Trainer generation lag observed' },
        }),
      ],
      now_ms: Date.parse('2026-04-09T21:00:00.000Z'),
    });
    expect(out.length).toBe(1);
  });
});

