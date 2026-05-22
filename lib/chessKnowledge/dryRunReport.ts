/** Dry-run report shape for opening / puzzle staging imports (no production writes). */

export type ChessDataDryRunReport = {
  generated_at: string;

  inputs: {
    zip_files: string[];
    extracted_files: number;
    file_types: Record<string, number>;
  };

  buckets: {
    opening_classification: number;
    opening_moves: number;
    opening_sources: number;
    puzzles: number;
    puzzle_solutions: number;
    source_metadata: number;
    import_logs: number;
    normalized_accl_data: number;
    unsafe_reference_only: number;
    unknown_manual_review: number;
  };

  validation: {
    legal_fens: number;
    illegal_fens: number;
    valid_san_sequences: number;
    invalid_san_sequences: number;
    valid_uci_sequences: number;
    invalid_uci_sequences: number;
    duplicate_positions: number;
    duplicate_puzzles: number;
    transposition_candidates: number;
    wrong_move_order_candidates: number;
    bad_eco_labels: number;
    missing_source_labels: number;
    missing_license_metadata: number;
    legal_puzzle_fens: number;
    illegal_puzzle_fens: number;
    invalid_puzzle_side_to_move: number;
    missing_puzzle_solutions: number;
    unknown_puzzle_categories: number;
    unknown_motif_tags: number;
    puzzle_live_eligible_violations: number;
    puzzle_tournament_eligible_violations: number;
  };

  openings: {
    count: number;
    unique_fen_count: number;
    duplicate_fen_count: number;
    unique_eco_count: number;
    source_labels: string[];
    bot_start_eligible: number;
    trainer_eligible: number;
    position_setup_eligible: number;
    live_competitive_eligible: number;
    tournament_eligible: number;
    transposition_candidates: number;
  };

  puzzles: {
    candidate_count: number;
    legal_fens: number;
    illegal_fens: number;
    valid_solution_san: number;
    invalid_solution_san: number;
    valid_solution_uci: number;
    invalid_solution_uci: number;
    unknown_categories: number;
    unknown_motif_tags: number;
    duplicate_positions: number;
    missing_source_labels: number;
    missing_license_metadata: number;
    live_eligible_violations: number;
    tournament_eligible_violations: number;
  };

  safety: {
    production_mutations_attempted: false;
    live_game_hooks_detected: boolean;
    tournament_hooks_detected: boolean;
    copyrighted_prose_detected: boolean;
    scanned_or_ocr_material_detected: boolean;
    generic_chess_knowledge_table_detected: boolean;
  };

  inventory: Array<{
    path: string;
    relative_path: string;
    bytes: number;
    extension: string;
    category: string;
    bucket: keyof ChessDataDryRunReport['buckets'];
    safe_for_structured_staging: boolean;
    notes: string[];
  }>;

  recommendations: string[];
  blockers: string[];
};

export function emptyChessDataDryRunReport(): ChessDataDryRunReport {
  return {
    generated_at: new Date().toISOString(),
    inputs: { zip_files: [], extracted_files: 0, file_types: {} },
    buckets: {
      opening_classification: 0,
      opening_moves: 0,
      opening_sources: 0,
      puzzles: 0,
      puzzle_solutions: 0,
      source_metadata: 0,
      import_logs: 0,
      normalized_accl_data: 0,
      unsafe_reference_only: 0,
      unknown_manual_review: 0,
    },
    validation: {
      legal_fens: 0,
      illegal_fens: 0,
      valid_san_sequences: 0,
      invalid_san_sequences: 0,
      valid_uci_sequences: 0,
      invalid_uci_sequences: 0,
      duplicate_positions: 0,
      duplicate_puzzles: 0,
      transposition_candidates: 0,
      wrong_move_order_candidates: 0,
      bad_eco_labels: 0,
      missing_source_labels: 0,
      missing_license_metadata: 0,
      legal_puzzle_fens: 0,
      illegal_puzzle_fens: 0,
      invalid_puzzle_side_to_move: 0,
      missing_puzzle_solutions: 0,
      unknown_puzzle_categories: 0,
      unknown_motif_tags: 0,
      puzzle_live_eligible_violations: 0,
      puzzle_tournament_eligible_violations: 0,
    },
    openings: {
      count: 0,
      unique_fen_count: 0,
      duplicate_fen_count: 0,
      unique_eco_count: 0,
      source_labels: [],
      bot_start_eligible: 0,
      trainer_eligible: 0,
      position_setup_eligible: 0,
      live_competitive_eligible: 0,
      tournament_eligible: 0,
      transposition_candidates: 0,
    },
    puzzles: {
      candidate_count: 0,
      legal_fens: 0,
      illegal_fens: 0,
      valid_solution_san: 0,
      invalid_solution_san: 0,
      valid_solution_uci: 0,
      invalid_solution_uci: 0,
      unknown_categories: 0,
      unknown_motif_tags: 0,
      duplicate_positions: 0,
      missing_source_labels: 0,
      missing_license_metadata: 0,
      live_eligible_violations: 0,
      tournament_eligible_violations: 0,
    },
    safety: {
      production_mutations_attempted: false,
      live_game_hooks_detected: false,
      tournament_hooks_detected: false,
      copyrighted_prose_detected: false,
      scanned_or_ocr_material_detected: false,
      generic_chess_knowledge_table_detected: false,
    },
    inventory: [],
    recommendations: [],
    blockers: [],
  };
}
