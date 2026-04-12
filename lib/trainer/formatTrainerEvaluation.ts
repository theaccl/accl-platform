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

/** Compare alternative to best line (from same side to move). */
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

export function centipawnToHumanLine(cp: number | null): string {
  if (cp == null) return 'Evaluation pending — position is sharp or balanced.';
  if (Math.abs(cp) < 25) return 'Roughly equal — the position is balanced.';
  if (Math.abs(cp) < 80) return cp > 0 ? 'Slight edge for the side to move.' : 'Slight disadvantage — find precise moves.';
  if (Math.abs(cp) < 200) return cp > 0 ? 'Clear advantage — stay accurate.' : 'Under pressure — defend carefully.';
  return cp > 0 ? 'Decisive advantage — convert calmly.' : 'Critical — only good moves keep the game alive.';
}
