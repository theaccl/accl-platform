import { test, expect } from '@playwright/test';

import {
  adaptConfigEnvHealthState,
  adaptFinishedGameArtifact,
  adaptModerationSafeOperationalSummary,
  adaptPlayerPatternProfile,
  adaptTournamentSafetyMetadata,
  adaptTrainerApprovedOutput,
} from '../../lib/nexus/adapters';

test.describe('NEXUS Phase 2 ingestion adapters', () => {
  test('finished-game artifact safe payload normalizes successfully', () => {
    const result = adaptFinishedGameArtifact({
      id: 'artifact-1',
      game_id: 'game-1',
      artifact_type: 'engine_structured',
      artifact_version: 'fga.engine.structured.1',
      analysis_partition: 'free',
      payload: {
        engine: {
          provider: 'stockfish',
          evaluation: { bestMove: 'e2e4', centipawn: 12, confidence: 0.8, multiPv: [{ rank: 1 }] },
        },
      },
      created_at: '2026-04-09T00:00:00.000Z',
      updated_at: '2026-04-09T00:00:01.000Z',
      debug_internal_note: 'should_be_stripped',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.envelope.source_type).toBe('finished_game_artifact');
      expect(result.value.envelope.payload).not.toHaveProperty('debug_internal_note');
      expect(result.value.envelope.payload).toHaveProperty('engine_summary');
      expect(result.value.source_refs[0]?.source_id).toBe('artifact-1');
    }
  });

  test('trainer-approved output normalizes and strips non-allowlisted fields', () => {
    const result = adaptTrainerApprovedOutput({
      id: 'trainer-1',
      user_id: 'user-1',
      source_game_id: 'game-1',
      status: 'approved',
      theme: 'Fork Awareness',
      fen: 'rnbqkbnr/...',
    });
    // fen key is forbidden and should fail closed.
    expect(result.ok).toBe(false);
  });

  test('player pattern profile safe payload normalizes successfully', () => {
    const result = adaptPlayerPatternProfile({
      user_id: 'user-2',
      pattern_tags: ['fork', 'pins'],
      suggested_themes: ['Calculation Discipline'],
      updated_at: '2026-04-09T01:00:00.000Z',
      noisy_extra: { foo: 'bar' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.envelope.payload).not.toHaveProperty('noisy_extra');
      expect(result.value.envelope.source_type).toBe('player_pattern_profile');
    }
  });

  test('moderation-safe operational summary normalizes successfully', () => {
    const result = adaptModerationSafeOperationalSummary({
      summary_id: 'ops-1',
      queue_counts: { failed: 1, completed: 42 },
      stale_counts: { running_stale: 0 },
      generated_at: '2026-04-09T01:30:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.envelope.source_type).toBe('moderation_safe_operational_summary');
    }
  });

  test('tournament safety metadata exposes only allowed metadata', () => {
    const result = adaptTournamentSafetyMetadata({
      game_id: 'game-safe-1',
      tournament_id: 't-1',
      status: 'finished',
      finished_at: '2026-04-09T03:00:00.000Z',
      fingerprint_present: true,
      fingerprint_count: 2,
      updated_at: '2026-04-09T03:01:00.000Z',
      internal_debug_counter: 999,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const p = result.value.envelope.payload as Record<string, unknown>;
      expect(Object.keys(p).sort()).toEqual(
        [
          'fingerprint_count',
          'fingerprint_present',
          'game_id',
          'game_status',
          'has_finish_timestamp',
          'tournament_id',
          'updated_at',
        ].sort()
      );
      expect(p).not.toHaveProperty('fen');
      expect(p).not.toHaveProperty('pv');
      expect(p).not.toHaveProperty('bestmove');
    }
  });

  test('tournament safety metadata rejects replay-equivalent detail before generation', () => {
    const result = adaptTournamentSafetyMetadata({
      game_id: 'game-safe-2',
      tournament_id: 't-2',
      status: 'active',
      fen: 'rnbqkbnr/pppppppp/...',
      bestmove: 'e2e4',
    });
    expect(result.ok).toBe(false);
  });

  test('config/env health state normalizes successfully', () => {
    const result = adaptConfigEnvHealthState({
      generated_at: '2026-04-09T04:00:00.000Z',
      has_errors: true,
      states: [
        { key: 'BOT_USER_ID_CARDI', ok: false, category: 'missing_profile', detail: 'not found' },
        { key: 'NEXT_PUBLIC_SUPABASE_URL', ok: true, category: 'ok', detail: 'present' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.envelope.source_type).toBe('config_env_health_state');
      const p = result.value.envelope.payload as Record<string, unknown>;
      expect(Array.isArray(p.states)).toBe(true);
    }
  });

  test('unsafe moderation payload is rejected', () => {
    const result = adaptModerationSafeOperationalSummary({
      summary_id: 'ops-unsafe',
      queue_counts: { failed: 2 },
      authorization: 'Bearer secret',
    });
    expect(result.ok).toBe(false);
  });
});

