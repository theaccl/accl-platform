/**
 * ACCL chess truth hierarchy — constitutional ordering for all knowledge layers.
 * Opening encyclopedia and repertoire are context only; engine/tablebase are truth.
 */

export const CHESS_TRUTH_LAYERS = [
  'legal_move_validation',
  'tablebase',
  'engine_evaluation',
  'opening_encyclopedia_classification',
  'repertoire_player_context',
  'trainer_ai_explanation',
] as const;

export type ChessTruthLayer = (typeof CHESS_TRUTH_LAYERS)[number];

/** Layers that may influence live-board or in-game assistance — forbidden for encyclopedia/puzzles. */
export const LIVE_ASSISTANCE_FORBIDDEN_LAYERS = [
  'opening_encyclopedia_classification',
  'repertoire_player_context',
  'trainer_ai_explanation',
] as const;

export const CHESS_KNOWLEDGE_SOURCE_LABELS = ['MCO-15', 'POLGAR-5334'] as const;

export type ChessKnowledgeSourceLabel = (typeof CHESS_KNOWLEDGE_SOURCE_LABELS)[number];

export const KNOWLEDGE_PLACEMENT_ROUTES = {
  openingEncyclopedia: 'profile/trainer/repertoire',
  tacticalEncyclopedia: 'profile/trainer/tactical',
  vault: 'games/move_logs',
  engineArtifacts: 'finished_game_analysis_artifacts',
} as const;

/** Opening book / repertoire cannot outrank engine verdict in mentor payloads. */
export function openingContextOverridesEngine(): false {
  return false;
}
