/**
 * Table / module map for ACCL chess knowledge layers.
 * Engine analysis artifacts remain on existing `finished_game_analysis_*` tables.
 * Vault remains `games` + `game_move_logs` — not duplicated here.
 */

export const CHESS_KNOWLEDGE_TABLES = {
  sourceRegistry: 'chess_knowledge_sources',
  opening: {
    families: 'chess_opening_families',
    lines: 'chess_opening_lines',
  },
  tactical: {
    categories: 'chess_tactical_categories',
    tags: 'chess_tactical_tags',
  },
  finishedLinkage: {
    openingMatches: 'finished_game_opening_matches',
    tacticExtractions: 'finished_game_tactic_extractions',
  },
  repertoire: {
    entries: 'player_repertoire_entries',
    colorStats: 'player_opening_color_stats',
  },
  engineArtifacts: {
    jobs: 'finished_game_analysis_jobs',
    artifacts: 'finished_game_analysis_artifacts',
    intakeRpc: 'get_finished_game_analysis_intake',
  },
  vault: {
    games: 'games',
    moveLogs: 'game_move_logs',
  },
  trainerLegacy: {
    patternProfiles: 'player_pattern_profiles',
    generatedPositions: 'trainer_generated_positions',
  },
} as const;

/** Explicit ban: no generic chess_knowledge blob table. */
export const FORBIDDEN_GENERIC_TABLES = ['chess_knowledge', 'chess_knowledge_entries', 'generic_chess_knowledge'] as const;

export type OpeningFamilySeed = {
  id: string;
  displayName: string;
  ecoFamily: string | null;
  movePrefixSan: string | null;
  sourceLabel: 'MCO-15';
};

export type TacticalCategorySeed = {
  id: string;
  displayName: string;
  sourceLabel: 'POLGAR-5334';
};
