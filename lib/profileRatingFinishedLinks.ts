/**
 * Finished-game review links for profile rating ticker points (history only).
 */

export function finishedGameHref(gameId: string): string {
  return `/finished/${gameId}`;
}

export function finishedGameTrainHref(gameId: string): string {
  return `/finished/${gameId}/train`;
}
