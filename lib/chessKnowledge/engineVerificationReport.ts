/** Engine verification report for staged opening / puzzle data (offline only). */

import {
  emptyEngineProvenance,
  type EngineVerificationProvenance,
} from './engineProvenance';

export type EngineVerificationStatus =
  | 'legal_moves_validated'
  | 'engine_verified'
  | 'engine_not_available'
  | 'engine_verification_failed'
  | 'needs_manual_review';

export type ChessDataEngineVerificationRecord = {
  id: string;
  record_type: 'opening_position' | 'puzzle_candidate';
  engine_verification_status: EngineVerificationStatus;
  /** Structured provenance; null fields mean unavailable / not run — never fabricated. */
  engine_provenance: EngineVerificationProvenance;
  notes: string[];
};

export type ChessDataEngineVerificationReport = {
  generated_at: string;
  input_path: string;

  openings: {
    total: number;
    legal_sequences: number;
    fen_matches: number;
    fen_mismatches: number;
    side_to_move_mismatches: number;
    engine_checked: number;
    engine_not_required: number;
  };

  puzzles: {
    total: number;
    legal_fens: number;
    legal_solution_san: number;
    legal_solution_uci: number;
    engine_checked: number;
    engine_verified: number;
    engine_not_available: number;
    needs_manual_review: number;
    failed: number;
  };

  records: ChessDataEngineVerificationRecord[];

  safety: {
    production_mutations_attempted: false;
    live_game_hooks_detected: false;
    tournament_hooks_detected: false;
    db_writes_attempted: false;
  };

  recommendations: string[];
  blockers: string[];
};

export function emptyChessDataEngineVerificationReport(inputPath = ''): ChessDataEngineVerificationReport {
  return {
    generated_at: new Date().toISOString(),
    input_path: inputPath,
    openings: {
      total: 0,
      legal_sequences: 0,
      fen_matches: 0,
      fen_mismatches: 0,
      side_to_move_mismatches: 0,
      engine_checked: 0,
      engine_not_required: 0,
    },
    puzzles: {
      total: 0,
      legal_fens: 0,
      legal_solution_san: 0,
      legal_solution_uci: 0,
      engine_checked: 0,
      engine_verified: 0,
      engine_not_available: 0,
      needs_manual_review: 0,
      failed: 0,
    },
    records: [],
    safety: {
      production_mutations_attempted: false,
      live_game_hooks_detected: false,
      tournament_hooks_detected: false,
      db_writes_attempted: false,
    },
    recommendations: [],
    blockers: [],
  };
}

export function notRunEngineProvenance(
  status: EngineVerificationStatus = 'legal_moves_validated'
): EngineVerificationProvenance {
  return emptyEngineProvenance(status, 'engine_verification_not_run');
}
