import { test, expect } from '@playwright/test';

import { validateNexusInput, validateNexusOutput } from '../../lib/nexus/contract';

test.describe('NEXUS Phase 1 contract: fail-closed policy validation', () => {
  test('accepts allowlisted finished-game artifact input', () => {
    const result = validateNexusInput({
      source_type: 'finished_game_artifact',
      source_id: 'artifact-123',
      payload: {
        artifact_type: 'engine_structured',
        game_id: 'game-123',
        analysis_partition: 'free',
      },
    });
    expect(result.ok).toBe(true);
  });

  test('rejects forbidden active/protected tournament position input', () => {
    const result = validateNexusInput({
      source_type: 'tournament_safety_metadata',
      source_id: 'safe-1',
      payload: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w',
        guard: 'present',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.category).toBe('forbidden_input');
    }
  });

  test('rejects secrets/auth/session internals input', () => {
    const result = validateNexusInput({
      source_type: 'moderation_safe_operational_summary',
      source_id: 'ops-1',
      payload: {
        summary: 'queue healthy',
        access_token: 'secret-token',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.category === 'forbidden_input')).toBe(true);
    }
  });

  test('rejects live authoritative mutation path references', () => {
    const result = validateNexusInput({
      source_type: 'config_env_health_state',
      source_id: 'env-1',
      payload: {
        route: '/api/game/submit-move',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /mutation paths/i.test(e.message))).toBe(true);
    }
  });

  test('accepts valid advisory output with citations and classification', () => {
    const result = validateNexusOutput({
      output_type: 'insight',
      subject_scope: 'player',
      confidence: 0.82,
      source_refs: [{ source_type: 'player_pattern_profile', source_id: 'user-1' }],
      generated_at: new Date().toISOString(),
      model_version: 'nexus-m1',
      policy_version: 'nexus-policy-1',
      content: {
        title: 'Pattern trend',
        summary: 'Recent finished-game signals suggest improved fork awareness.',
      },
    });
    expect(result.ok).toBe(true);
  });

  test('rejects uncited/unclassified output', () => {
    const result = validateNexusOutput({
      output_type: 'free_text',
      subject_scope: 'player',
      confidence: 0.7,
      source_refs: [],
      generated_at: new Date().toISOString(),
      model_version: 'nexus-m1',
      policy_version: 'nexus-policy-1',
      content: {
        title: 'Do this now',
        summary: 'Take action immediately.',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.category === 'schema_error' || e.category === 'missing_required')).toBe(
        true
      );
    }
  });

  test('rejects authoritative/sanction output intent', () => {
    const result = validateNexusOutput({
      output_type: 'recommendation',
      subject_scope: 'moderation',
      confidence: 0.9,
      source_refs: [{ source_type: 'moderation_safe_operational_summary', source_id: 'ops-22' }],
      generated_at: new Date().toISOString(),
      model_version: 'nexus-m1',
      policy_version: 'nexus-policy-1',
      authoritative_action: { type: 'ban_user' },
      content: {
        title: 'Enforce ban',
        summary: 'Ban and suspend this account.',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.category === 'forbidden_output')).toBe(true);
    }
  });

  test('rejects protected-position disclosure in output content', () => {
    const result = validateNexusOutput({
      output_type: 'warning',
      subject_scope: 'system',
      confidence: 0.5,
      source_refs: [{ source_type: 'tournament_safety_metadata', source_id: 't-safe-1' }],
      generated_at: new Date().toISOString(),
      model_version: 'nexus-m1',
      policy_version: 'nexus-policy-1',
      content: {
        title: 'Leak',
        summary: 'Use FEN and bestmove pv lines for this tournament position.',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.category === 'forbidden_output')).toBe(true);
    }
  });

  test('rejects output referencing authoritative mutation paths', () => {
    const result = validateNexusOutput({
      output_type: 'warning',
      subject_scope: 'system',
      confidence: 0.74,
      source_refs: [{ source_type: 'moderation_safe_operational_summary', source_id: 'ops-88' }],
      generated_at: new Date().toISOString(),
      model_version: 'nexus-m1',
      policy_version: 'nexus-policy-1',
      content: {
        title: 'Mutation route',
        summary: 'Invoke /api/game/submit-move then finish_game for immediate enforcement.',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.category === 'forbidden_output')).toBe(true);
    }
  });

  test('rejects output with invalid expiry ordering', () => {
    const result = validateNexusOutput({
      output_type: 'insight',
      subject_scope: 'player',
      confidence: 0.6,
      source_refs: [{ source_type: 'player_pattern_profile', source_id: 'user-1' }],
      generated_at: '2026-04-09T20:00:00.000Z',
      expires_at: '2026-04-09T19:00:00.000Z',
      model_version: 'nexus-m1',
      policy_version: 'nexus-policy-1',
      content: {
        title: 'Trend',
        summary: 'Stable pattern signal.',
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.category === 'schema_error')).toBe(true);
    }
  });
});

