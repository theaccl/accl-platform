/**
 * Shared predicates for home / free lobby so "ready", "waiting", and "active" stay consistent.
 */

export type MinimalLobbyGame = {
  /** Present on real `games` rows; used to de-dupe partition buckets. */
  id?: string;
  status: string;
  white_player_id: string;
  black_player_id: string | null;
};

function lobbyRowKey(g: MinimalLobbyGame): string {
  return g.id ?? `${g.white_player_id}:${String(g.black_player_id)}:${g.status}`;
}

export function bothPlayersSeated(g: MinimalLobbyGame): boolean {
  return Boolean(g.white_player_id && g.black_player_id);
}

/** Board exists with two assigned seats and can proceed (mirrors common game-page checks). */
export function isBoardReadyGame(g: MinimalLobbyGame): boolean {
  if (!bothPlayersSeated(g)) return false;
  return g.status === 'active' || g.status === 'waiting';
}

/**
 * Non-finished row that is not yet paired (open seat or any one-sided row).
 */
export function isWaitingForOpponentSeat(g: MinimalLobbyGame): boolean {
  if (g.status === 'finished') return false;
  if (bothPlayersSeated(g)) return false;
  return g.status === 'active' || g.status === 'waiting';
}

export function isLobbyNonFinishedGame(g: MinimalLobbyGame): boolean {
  return g.status !== 'finished';
}

/** Order: in-progress (two seats) first, then waiting seats, then any remainder. */
export function sortLobbyGamesForDisplay<T extends MinimalLobbyGame>(games: T[]): T[] {
  const seated = games.filter(isBoardReadyGame);
  const waiting = games.filter(isWaitingForOpponentSeat);
  const rest = games.filter((g) => !isBoardReadyGame(g) && !isWaitingForOpponentSeat(g));
  return [...seated, ...waiting, ...rest];
}

/** Result of splitting non-finished rows for lobby display (input must be newest-first). */
export type LobbyGamePartition<T extends MinimalLobbyGame> = {
  /** Newest board-ready row — canonical “current table”. */
  canonicalSeated: T | null;
  /** Older board-ready rows (stale second tables). */
  staleSeated: T[];
  /** Newest open-seat / waiting row. */
  primaryWaiting: T | null;
  /** Older open-seat rows. */
  staleWaiting: T[];
  /** Remaining non-finished rows (unexpected shape). */
  otherNonFinished: T[];
};

/**
 * Partition non-finished games for lobby UX. `gamesNewestFirst` must follow `created_at` descending.
 */
export function partitionNonFinishedLobbyGames<T extends MinimalLobbyGame>(
  gamesNewestFirst: T[]
): LobbyGamePartition<T> {
  const canonicalSeated = gamesNewestFirst.find(isBoardReadyGame) ?? null;
  const canonKey = canonicalSeated ? lobbyRowKey(canonicalSeated) : null;
  const staleSeated = gamesNewestFirst.filter(
    (g) => isBoardReadyGame(g) && lobbyRowKey(g) !== canonKey
  );
  const primaryWaiting = gamesNewestFirst.find(isWaitingForOpponentSeat) ?? null;
  const primaryWaitKey = primaryWaiting ? lobbyRowKey(primaryWaiting) : null;
  const staleWaiting = gamesNewestFirst.filter(
    (g) => isWaitingForOpponentSeat(g) && lobbyRowKey(g) !== primaryWaitKey
  );
  const claimed = new Set<string>();
  if (canonicalSeated) claimed.add(canonKey!);
  staleSeated.forEach((g) => claimed.add(lobbyRowKey(g)));
  if (primaryWaiting) claimed.add(primaryWaitKey!);
  staleWaiting.forEach((g) => claimed.add(lobbyRowKey(g)));
  const otherNonFinished = gamesNewestFirst.filter((g) => !claimed.has(lobbyRowKey(g)));
  return { canonicalSeated, staleSeated, primaryWaiting, staleWaiting, otherNonFinished };
}

/**
 * Find Match / recovery: canonical seated table if any, else newest waiting open seat.
 * `games` should be newest-first (e.g. `created_at` desc).
 */
export function pickExistingActiveGameForRedirect<T extends MinimalLobbyGame>(games: T[]): T | null {
  const nonFin = games.filter(isLobbyNonFinishedGame);
  const p = partitionNonFinishedLobbyGames(nonFin);
  if (p.canonicalSeated) return p.canonicalSeated;
  if (p.primaryWaiting) return p.primaryWaiting;
  return null;
}
