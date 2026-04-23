/** Extract `/game/:id` id from pathname, or null. */
export function parseGameIdFromPath(path: string): string | null {
  const m = /^\/game\/([^/?#]+)/.exec(path);
  const id = m?.[1]?.trim();
  return id && id.length > 0 ? id : null;
}

export type GameLikeForAcceptRedirect = { tempo?: string | null };

export function getTempoType(game: GameLikeForAcceptRedirect | null): 'live' | 'daily' | 'correspondence' {
  if (!game) return 'correspondence';
  if (game.tempo === 'live') return 'live';
  if (game.tempo === 'daily') return 'daily';
  return 'correspondence';
}

const PRIORITY: Record<'live' | 'daily' | 'correspondence', number> = {
  live: 3,
  daily: 2,
  correspondence: 1,
};

/**
 * After a successful accept: navigate only if the accepted game outranks the user's current active/waiting game.
 */
export function shouldRedirectOnAccept(
  currentGame: GameLikeForAcceptRedirect | null,
  acceptedGame: GameLikeForAcceptRedirect
): boolean {
  if (!currentGame) return true;

  const currentPriority = PRIORITY[getTempoType(currentGame)];
  const newPriority = PRIORITY[getTempoType(acceptedGame)];

  return newPriority > currentPriority;
}
