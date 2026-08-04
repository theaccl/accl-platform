import { expect, test } from '@playwright/test';

import {
  assertHonestEngineProvenance,
  emptyEngineProvenance,
} from '@/lib/chessKnowledge/engineProvenance';
import {
  findDuplicateNormalizedFenKeys,
  findDuplicatePuzzleIds,
  parseStagedJson,
  validateEngineUnavailableOrFailureState,
  validateFalseCompletionProvenance,
  validateFenString,
  validateLiveTournamentEligibilityFlags,
  validateMateCategorySolution,
  validateSanSequence,
  validateSanUciTerminalAgreement,
  validateSideToMove,
  validateUciSequence,
} from '@/lib/chessKnowledge/stagedDataValidation';

test.describe('chess knowledge hostile-input validation (pure)', () => {
  test('rejects malformed JSON', () => {
    const r = parseStagedJson('{not-json');
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'malformed_json')).toBe(true);
  });

  test('rejects illegal FEN', () => {
    const r = validateFenString('not-a-fen');
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe('illegal_fen');
  });

  test('rejects illegal SAN', () => {
    const start = '6k1/pppp1ppp/8/8/8/8/PPP2PPP/4R1K1 w - - 0 1';
    const r = validateSanSequence(start, ['Zz9']);
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe('illegal_san');
  });

  test('rejects illegal UCI', () => {
    const start = '6k1/pppp1ppp/8/8/8/8/PPP2PPP/4R1K1 w - - 0 1';
    const r = validateUciSequence(start, ['e2e9']);
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe('illegal_uci');
  });

  test('detects duplicate puzzle IDs', () => {
    const r = findDuplicatePuzzleIds([
      { id: 'p1' },
      { id: 'p2' },
      { puzzle_id: 'p1' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'duplicate_puzzle_id')).toBe(true);
  });

  test('detects duplicate normalized FEN keys', () => {
    const fen = '6k1/pppp1ppp/8/8/8/8/PPP2PPP/4R1K1 w - - 0 1';
    const r = findDuplicateNormalizedFenKeys([
      { id: 'a', fen },
      { id: 'b', fen: '6k1/pppp1ppp/8/8/8/8/PPP2PPP/4R1K1 w - - 5 9' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'duplicate_normalized_fen')).toBe(true);
  });

  test('detects side-to-move mismatch', () => {
    const fen = '6k1/pppp1ppp/8/8/8/8/PPP2PPP/4R1K1 w - - 0 1';
    const r = validateSideToMove(fen, 'black');
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe('side_to_move_mismatch');
  });

  test('rejects mate-category solution that does not end in checkmate', () => {
    const fen = '6k1/pppp1ppp/8/8/8/8/PPP2PPP/4R1K1 w - - 0 1';
    const r = validateMateCategorySolution(fen, ['Re2'], 'mate_in_1');
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe('mate_category_not_checkmate');
  });

  test('rejects SAN/UCI terminal-position disagreement', () => {
    const fen = '6k1/pppp1ppp/8/8/8/8/PPP2PPP/4R1K1 w - - 0 1';
    const r = validateSanUciTerminalAgreement(fen, ['Re8#'], ['e1e2']);
    expect(r.ok).toBe(false);
    expect(
      r.issues.some(
        (i) => i.code === 'san_uci_terminal_disagreement' || i.code === 'illegal_uci'
      )
    ).toBe(true);
  });

  test('accepts honest engine unavailable / failure state', () => {
    const unavailable = emptyEngineProvenance('engine_not_available', 'stockfish_asm_unavailable');
    expect(validateEngineUnavailableOrFailureState(unavailable).ok).toBe(true);
    const failed = emptyEngineProvenance('engine_verification_failed', 'illegal_fen');
    expect(validateEngineUnavailableOrFailureState(failed).ok).toBe(true);
  });

  test('rejects verification metadata that falsely claims completion', () => {
    const falseClaim = {
      ...emptyEngineProvenance('engine_verified', null),
      engine_name: null,
      verified_at: null,
      depth: 10,
      multipv: 3,
      unavailable_reason: null,
    };
    const honesty = assertHonestEngineProvenance(falseClaim);
    expect(honesty.ok).toBe(false);
    const r = validateFalseCompletionProvenance(falseClaim);
    expect(r.ok).toBe(false);
  });

  test('rejects live/tournament eligibility incorrectly set to true', () => {
    const r = validateLiveTournamentEligibilityFlags({
      usable_for_live_competitive: true,
      usable_for_tournament: true,
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'live_competitive_eligibility_true')).toBe(true);
    expect(r.issues.some((i) => i.code === 'tournament_eligibility_true')).toBe(true);
  });
});
