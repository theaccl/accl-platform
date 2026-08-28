export type MoveClassification = 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export type FormattedAlternative = {
  rank: number;
  move: string;
  centipawn: number | null;
  classification: MoveClassification;
};

/** Spread between best and second line (centipawns) → how critical the best move is. */
export function classifyBestLineSpread(deltaCp: number): MoveClassification {
  const d = Math.abs(deltaCp);
  if (d < 18) return 'Excellent';
  if (d < 55) return 'Good';
  if (d < 120) return 'Inaccuracy';
  if (d < 220) return 'Mistake';
  return 'Blunder';
}

/** Compare alternative to best line (from same side to move / mover POV). */
export function classifyMoveVsBest(bestCp: number | null, altCp: number | null): MoveClassification {
  if (bestCp == null || altCp == null) return 'Good';
  const loss = bestCp - altCp;
  const d = Math.abs(loss);
  if (d < 12) return 'Excellent';
  if (d < 45) return 'Good';
  if (d < 100) return 'Inaccuracy';
  if (d < 200) return 'Mistake';
  return 'Blunder';
}

/**
 * Human evaluation line. `cp` is mover-POV (legacy Trainer API).
 * Wording names White or Black explicitly — never “side to move”.
 */
export function centipawnToHumanLine(cp: number | null, turn: 'w' | 'b'): string {
  if (cp == null) return 'Evaluation pending — position is sharp or balanced.';
  const whiteCp = turn === 'b' ? -cp : cp;
  if (Math.abs(whiteCp) < 25) return 'Roughly equal — the position is balanced.';
  const side = whiteCp > 0 ? 'White' : 'Black';
  const mag = Math.abs(whiteCp);
  if (mag < 80) return `Slight edge for ${side}.`;
  if (mag < 200) return `Clear advantage for ${side}.`;
  return `Decisive advantage for ${side}.`;
}
