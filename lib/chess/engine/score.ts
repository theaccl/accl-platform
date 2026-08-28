import type { Side } from '@/lib/chess/position';
import type { EngineScore } from '@/lib/chess/engine/types';

function flipScore(score: EngineScore): EngineScore {
  if (score.kind === 'cp') {
    return { kind: 'cp', cp: -score.cp };
  }
  if (score.kind === 'mate') {
    return { kind: 'mate', mate: -score.mate };
  }
  return score;
}

/**
 * Convert a raw engine (side-to-move) score to White's point of view.
 * Mate remains mate; centipawns are never manufactured.
 */
export function toWhitePov(rawMoverScore: EngineScore, turn: Side): EngineScore {
  return turn === 'w' ? rawMoverScore : flipScore(rawMoverScore);
}

/** Convert a White-POV score back to side-to-move / mover POV for legacy consumers. */
export function toMoverPov(whitePovScore: EngineScore, turn: Side): EngineScore {
  return turn === 'w' ? whitePovScore : flipScore(whitePovScore);
}

export function moverPovCentipawn(whitePovScore: EngineScore, turn: Side): number | null {
  const mover = toMoverPov(whitePovScore, turn);
  return mover.kind === 'cp' ? mover.cp : null;
}

export function whitePovCentipawn(whitePovScore: EngineScore): number | null {
  return whitePovScore.kind === 'cp' ? whitePovScore.cp : null;
}
