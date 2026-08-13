type MovePosition = {
  fen_after?: string | null;
  [key: string]: unknown;
};

function fenPositionKey(fen: string | null | undefined): string | null {
  const fields = String(fen ?? '').trim().split(/\s+/);
  if (fields.length < 4) return null;
  return fields.slice(0, 4).join(' ');
}

/**
 * A last-move path is safe to render only when it describes the position that
 * the authoritative game row currently exposes. Realtime delivery may surface
 * the move-log insert before the games-row update; suppressing the highlight in
 * that gap prevents the opponent from seeing a pre-move path on the old board.
 */
export function lastMoveMatchesAuthoritativePosition(
  move: MovePosition | undefined,
  authoritativeFen: string | null | undefined
): boolean {
  if (!move) return false;
  const moveFen = fenPositionKey(move.fen_after);
  const gameFen = fenPositionKey(authoritativeFen);
  if (!moveFen || !gameFen) return false;
  return moveFen === gameFen;
}
