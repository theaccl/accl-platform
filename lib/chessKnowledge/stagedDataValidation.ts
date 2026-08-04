/**
 * Pure staged-data validation helpers for opening / puzzle dry-run intake.
 * No filesystem, network, process.exit, or database side effects.
 */

import { Chess } from 'chess.js';

import {
  assertHonestEngineProvenance,
  type EngineVerificationProvenance,
} from './engineProvenance';

export type StagedValidationIssue = {
  code: string;
  message: string;
};

export type StagedValidationResult = {
  ok: boolean;
  issues: StagedValidationIssue[];
};

function issue(code: string, message: string): StagedValidationIssue {
  return { code, message };
}

export function fenKey(fen: string): string {
  return String(fen).split(' ').slice(0, 4).join(' ');
}

export function parseStagedJson(text: string): StagedValidationResult & { data?: unknown } {
  try {
    return { ok: true, issues: [], data: JSON.parse(text) };
  } catch (e) {
    return {
      ok: false,
      issues: [issue('malformed_json', `Malformed JSON: ${String((e as Error)?.message ?? e)}`)],
    };
  }
}

export function validateFenString(fen: unknown): StagedValidationResult & { board?: Chess } {
  if (typeof fen !== 'string' || !fen.trim()) {
    return { ok: false, issues: [issue('illegal_fen', 'FEN missing or not a string')] };
  }
  try {
    const board = new Chess(fen.trim());
    return { ok: true, issues: [], board };
  } catch (e) {
    return {
      ok: false,
      issues: [issue('illegal_fen', `Illegal FEN: ${String((e as Error)?.message ?? e)}`)],
    };
  }
}

export function validateSanSequence(
  startFen: string,
  sans: unknown
): StagedValidationResult & { terminalFen?: string } {
  if (!Array.isArray(sans) || sans.length === 0) {
    return { ok: false, issues: [issue('illegal_san', 'SAN sequence missing or empty')] };
  }
  const fenResult = validateFenString(startFen);
  if (!fenResult.ok || !fenResult.board) return { ok: false, issues: fenResult.issues };

  const board = fenResult.board;
  for (const san of sans) {
    try {
      const m = board.move(String(san));
      if (!m) {
        return { ok: false, issues: [issue('illegal_san', `Illegal SAN: ${String(san)}`)] };
      }
    } catch (e) {
      return {
        ok: false,
        issues: [issue('illegal_san', `Illegal SAN: ${String(san)} (${String((e as Error)?.message ?? e)})`)],
      };
    }
  }
  return { ok: true, issues: [], terminalFen: board.fen() };
}

export function validateUciSequence(
  startFen: string,
  ucis: unknown
): StagedValidationResult & { terminalFen?: string } {
  if (!Array.isArray(ucis) || ucis.length === 0) {
    return { ok: false, issues: [issue('illegal_uci', 'UCI sequence missing or empty')] };
  }
  const fenResult = validateFenString(startFen);
  if (!fenResult.ok || !fenResult.board) return { ok: false, issues: fenResult.issues };

  const board = fenResult.board;
  for (const uci of ucis) {
    const move = String(uci);
    try {
      const m = board.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move.length > 4 ? move[4] : undefined,
      });
      if (!m) {
        return { ok: false, issues: [issue('illegal_uci', `Illegal UCI: ${move}`)] };
      }
    } catch (e) {
      return {
        ok: false,
        issues: [issue('illegal_uci', `Illegal UCI: ${move} (${String((e as Error)?.message ?? e)})`)],
      };
    }
  }
  return { ok: true, issues: [], terminalFen: board.fen() };
}

export function validateSideToMove(
  fen: string,
  sideToMove: unknown
): StagedValidationResult {
  const fenResult = validateFenString(fen);
  if (!fenResult.ok || !fenResult.board) return { ok: false, issues: fenResult.issues };
  if (sideToMove == null || sideToMove === '') return { ok: true, issues: [] };
  const expected = String(sideToMove);
  const actual = fenResult.board.turn() === 'w' ? 'white' : 'black';
  if (actual !== expected) {
    return {
      ok: false,
      issues: [issue('side_to_move_mismatch', `Expected ${expected}, FEN side is ${actual}`)],
    };
  }
  return { ok: true, issues: [] };
}

export function validateMateCategorySolution(
  fen: string,
  solutionSan: unknown,
  category: unknown
): StagedValidationResult {
  if (typeof category !== 'string' || !category.startsWith('mate_in_')) {
    return { ok: true, issues: [] };
  }
  const san = validateSanSequence(fen, solutionSan);
  if (!san.ok || !san.terminalFen) return { ok: false, issues: san.issues };
  const terminal = new Chess(san.terminalFen);
  if (!terminal.isCheckmate()) {
    return {
      ok: false,
      issues: [
        issue(
          'mate_category_not_checkmate',
          `Category ${category} but solution does not end in checkmate`
        ),
      ],
    };
  }
  return { ok: true, issues: [] };
}

export function validateSanUciTerminalAgreement(
  fen: string,
  solutionSan: unknown,
  solutionUci: unknown
): StagedValidationResult {
  const san = validateSanSequence(fen, solutionSan);
  const uci = validateUciSequence(fen, solutionUci);
  if (!san.ok) return { ok: false, issues: san.issues };
  if (!uci.ok) return { ok: false, issues: uci.issues };
  if (fenKey(san.terminalFen!) !== fenKey(uci.terminalFen!)) {
    return {
      ok: false,
      issues: [
        issue('san_uci_terminal_disagreement', 'SAN and UCI solutions reach different positions'),
      ],
    };
  }
  return { ok: true, issues: [] };
}

export function findDuplicatePuzzleIds(
  records: Array<{ id?: unknown; puzzle_id?: unknown }>
): StagedValidationResult {
  const seen = new Set<string>();
  const issues: StagedValidationIssue[] = [];
  for (const row of records) {
    const id = String(row.puzzle_id ?? row.id ?? '');
    if (!id) continue;
    if (seen.has(id)) {
      issues.push(issue('duplicate_puzzle_id', `Duplicate puzzle id: ${id}`));
    } else {
      seen.add(id);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function findDuplicateNormalizedFenKeys(
  records: Array<{ fen?: unknown; puzzle_fen?: unknown; tactic_fen?: unknown; id?: unknown }>
): StagedValidationResult {
  const seen = new Map<string, string>();
  const issues: StagedValidationIssue[] = [];
  for (const row of records) {
    const fen = row.puzzle_fen ?? row.tactic_fen ?? row.fen;
    if (typeof fen !== 'string') continue;
    const fenResult = validateFenString(fen);
    if (!fenResult.ok || !fenResult.board) continue;
    const key = fenKey(fenResult.board.fen());
    const id = String(row.id ?? key);
    if (seen.has(key) && seen.get(key) !== id) {
      issues.push(issue('duplicate_normalized_fen', `Duplicate normalized FEN key: ${key}`));
    } else if (!seen.has(key)) {
      seen.set(key, id);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateLiveTournamentEligibilityFlags(row: {
  usable_for_live_competitive?: unknown;
  usable_for_tournament?: unknown;
}): StagedValidationResult {
  const issues: StagedValidationIssue[] = [];
  if (row.usable_for_live_competitive === true) {
    issues.push(
      issue('live_competitive_eligibility_true', 'usable_for_live_competitive must remain false')
    );
  }
  if (row.usable_for_tournament === true) {
    issues.push(issue('tournament_eligibility_true', 'usable_for_tournament must remain false'));
  }
  return { ok: issues.length === 0, issues };
}

export function validateEngineUnavailableOrFailureState(
  provenance: EngineVerificationProvenance
): StagedValidationResult {
  if (provenance.verification_status === 'engine_verified') {
    return {
      ok: false,
      issues: [issue('false_completion_claim', 'Status claims engine_verified in failure path')],
    };
  }
  if (
    provenance.verification_status !== 'engine_not_available' &&
    provenance.verification_status !== 'engine_verification_failed'
  ) {
    return {
      ok: false,
      issues: [
        issue(
          'expected_engine_unavailable_or_failed',
          `Expected engine_not_available or engine_verification_failed, got ${provenance.verification_status}`
        ),
      ],
    };
  }
  if (!provenance.unavailable_reason && provenance.verification_status === 'engine_not_available') {
    return {
      ok: false,
      issues: [issue('missing_unavailable_reason', 'engine_not_available requires a reason')],
    };
  }
  return { ok: true, issues: [] };
}

export function validateFalseCompletionProvenance(
  provenance: EngineVerificationProvenance
): StagedValidationResult {
  const honesty = assertHonestEngineProvenance(provenance);
  if (!honesty.ok) {
    return {
      ok: false,
      issues: honesty.issues.map((code) =>
        issue(code, 'Provenance falsely claims or misstates engine verification completion')
      ),
    };
  }
  return { ok: true, issues: [] };
}
