export type ReplayHighlightMove = {
  san?: string | null;
  from_sq?: string | null;
  to_sq?: string | null;
  fen_after?: string | null;
};

export type ReplayHighlightSelection<T extends ReplayHighlightMove = ReplayHighlightMove> = {
  move: T | undefined;
  from: string | null;
  to: string | null;
};

function squareOrNull(value: string | null | undefined): string | null {
  const square = value?.trim();
  return square ? square : null;
}

function selectionFromMove<T extends ReplayHighlightMove>(
  move: T | undefined
): ReplayHighlightSelection<T> {
  return {
    move,
    from: squareOrNull(move?.from_sq),
    to: squareOrNull(move?.to_sq),
  };
}

/**
 * Choose the recorded move/squares for a replay step.
 * Step 0 and empty logs select nothing; step N>0 clamps to the last stored move;
 * `replayStep === null` selects the final stored move. Incomplete squares fail closed.
 */
export function selectReplayHighlight<T extends ReplayHighlightMove>(
  moveLogs: readonly T[],
  replayStep: number | null
): ReplayHighlightSelection<T> {
  if (moveLogs.length === 0) {
    return { move: undefined, from: null, to: null };
  }

  if (replayStep !== null) {
    if (replayStep <= 0) {
      return { move: undefined, from: null, to: null };
    }
    const index = Math.min(replayStep, moveLogs.length) - 1;
    if (index < 0) {
      return { move: undefined, from: null, to: null };
    }
    return selectionFromMove(moveLogs[index]);
  }

  return selectionFromMove(moveLogs[moveLogs.length - 1]);
}
