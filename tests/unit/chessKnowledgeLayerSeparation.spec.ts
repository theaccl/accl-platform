import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildTrainerExplanationPayload,
  sanitizeEngineArtifactForMentor,
  sanitizeOpeningMetadataForMentor,
} from '@/lib/chessKnowledge/mentorPayloads';
import {
  assertNoActiveTournamentKnowledgeUse,
  CHESS_KNOWLEDGE_SOURCE_LABELS,
  CHESS_TRUTH_LAYERS,
  openingContextOverridesEngine,
} from '@/lib/chessKnowledge';
import { CHESS_KNOWLEDGE_TABLES, FORBIDDEN_GENERIC_TABLES } from '@/lib/chessKnowledge/layers';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

test.describe('chess knowledge layer separation (static)', () => {
  test('migration defines separated tables and source registry — no generic chess_knowledge table', () => {
    const sql = src(
      'supabase/migrations/20260804155321_chess_knowledge_layer_foundation_reconciliation.sql'
    );
    expect(sql).toContain('chess_knowledge_sources');
    expect(sql).toContain('chess_opening_families');
    expect(sql).toContain('chess_tactical_categories');
    expect(sql).toContain('finished_game_opening_matches');
    expect(sql).toContain('finished_game_tactic_extractions');
    expect(sql).toContain('player_repertoire_entries');
    expect(sql).toContain("'MCO-15'");
    expect(sql).toContain("'POLGAR-5334'");
    expect(sql).not.toMatch(/create table if not exists public\.chess_knowledge\s*\(/i);
    for (const banned of FORBIDDEN_GENERIC_TABLES) {
      expect(sql).not.toMatch(
        new RegExp(`create table if not exists public\\.${banned}\\s*\\(`, 'i')
      );
    }
    // Fail-closed: no authenticated GRANT SELECT on derived tables.
    expect(sql).not.toMatch(
      /grant\s+select\s+on\s+public\.finished_game_opening_matches\s+to\s+authenticated/i
    );
    expect(sql).not.toMatch(
      /grant\s+select\s+on\s+public\.finished_game_tactic_extractions\s+to\s+authenticated/i
    );
    expect(sql).not.toMatch(
      /grant\s+select\s+on\s+public\.player_repertoire_entries\s+to\s+authenticated/i
    );
    expect(sql).not.toMatch(
      /grant\s+select\s+on\s+public\.player_opening_color_stats\s+to\s+authenticated/i
    );
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('public.get_finished_game_analysis_intake(p_game_id)');
    expect(sql).toContain('insert into public.finished_game_opening_matches');
    expect(sql).toContain('revoke all on function public.upsert_finished_game_opening_match from public');
    expect(sql).toContain(
      'grant execute on function public.upsert_finished_game_opening_match to service_role'
    );
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.upsert_finished_game_opening_match\s+to\s+(anon|authenticated)/i
    );
  });

  test('finished opening match RPC requires finished intake', () => {
    const sql = src(
      'supabase/migrations/20260804155321_chess_knowledge_layer_foundation_reconciliation.sql'
    );
    expect(sql).toContain('public.get_finished_game_analysis_intake(p_game_id) is null');
    expect(sql).toContain('upsert_finished_game_opening_match');
  });

  test('existing finished-game analysis intake boundary preserved', () => {
    const sql = src('supabase/migrations/20260406210000_finished_game_analysis_intake_rpc.sql');
    expect(sql).toContain("and status = 'finished'");
    const guard = src('lib/chessKnowledge/guards.ts');
    expect(guard).toContain('fetchFinishedGameAnalysisIntake');
    const trainer = src('lib/trainer/trainerAnalysisGuard.ts');
    expect(trainer).toContain('ACTIVE_TOURNAMENT');
    expect(trainer).toContain('GAME_NOT_FINISHED');
  });

  test('truth hierarchy ranks engine above opening context', () => {
    expect(CHESS_TRUTH_LAYERS.indexOf('engine_evaluation')).toBeLessThan(
      CHESS_TRUTH_LAYERS.indexOf('opening_encyclopedia_classification')
    );
    expect(CHESS_TRUTH_LAYERS.indexOf('opening_encyclopedia_classification')).toBeLessThan(
      CHESS_TRUTH_LAYERS.indexOf('trainer_ai_explanation')
    );
    expect(openingContextOverridesEngine()).toBe(false);
  });

  test('active tournament game blocked from knowledge intake', () => {
    const r = assertNoActiveTournamentKnowledgeUse({
      status: 'active',
      tournamentId: 't-1',
      mode: 'STANDARD',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ACTIVE_TOURNAMENT');
  });

  test('mentor payload is sanitized and post-game only', () => {
    const opening = sanitizeOpeningMetadataForMentor({
      familyId: 'sicilian',
      familyDisplayName: 'Sicilian Defense',
      sourceLabel: 'MCO-15',
    });
    const engine = sanitizeEngineArtifactForMentor({
      verdict: 'inaccuracy',
      centipawnEval: -120,
      bestMoveSan: 'Nf3',
    });
    const payload = buildTrainerExplanationPayload({
      intake: {
        schema_version: 'fgi.1',
        game: {
          id: '00000000-0000-4000-8000-000000000001',
          status: 'finished',
          analysis_partition: 'free',
          play_context: 'free',
          rated: true,
          tempo: 'live',
          live_time_control: '5+5',
          source_type: 'bot_game',
          tournament_id: null,
          mode: 'STANDARD',
          white_player_id: '00000000-0000-4000-8000-000000000002',
          black_player_id: '00000000-0000-4000-8000-000000000003',
          winner_id: null,
          result: null,
          end_reason: null,
          finished_at: null,
          created_at: new Date().toISOString(),
          final_fen: null,
          final_turn: null,
        },
        players: { white: null, black: null },
        move_logs: [],
      },
      playerColor: 'white',
      opening,
      engine,
    });
    expect(payload.explanationMode).toBe('post_game_only');
    expect(payload.openingOverridesEngine).toBe(false);
    expect(payload.opening?.authority).toBe('classification_only');
    expect(payload.engine?.authority).toBe('engine_or_tablebase');
    expect(JSON.stringify(payload)).not.toMatch(/copyrighted|pdf_page|multipv/i);
  });

  test('layer map references engine artifacts without duplicating vault', () => {
    expect(CHESS_KNOWLEDGE_TABLES.engineArtifacts.intakeRpc).toBe('get_finished_game_analysis_intake');
    expect(CHESS_KNOWLEDGE_TABLES.vault.games).toBe('games');
    expect(CHESS_KNOWLEDGE_SOURCE_LABELS).toContain('MCO-15');
    expect(CHESS_KNOWLEDGE_SOURCE_LABELS).toContain('POLGAR-5334');
  });
});
