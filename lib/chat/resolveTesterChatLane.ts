/** Intended lane from the game page — corrected with `resolveTesterChatLane` + board seat. */
export type GameTesterChatViewerRole = 'table' | 'spectator' | 'postgame_player' | 'none';

/**
 * Board spectators must never mount the `game_player` UI; seated players must never mount `game_spectator`,
 * even if `viewerChatRole` disagrees with the current `games` row for a render.
 */
export function resolveTesterChatLane(
  requested: GameTesterChatViewerRole,
  isBoardSpectator: boolean,
  gameTempo: string | null,
  gameStatus: string
): GameTesterChatViewerRole {
  const live = String(gameTempo ?? '').trim().toLowerCase() === 'live';
  const st = String(gameStatus ?? '').trim().toLowerCase();

  if (isBoardSpectator) {
    if (live && (st === 'active' || st === 'waiting' || st === 'finished')) return 'spectator';
    return requested === 'spectator' ? 'spectator' : 'none';
  }

  if (requested === 'spectator') {
    if (!live) return 'none';
    if (st === 'active' || st === 'waiting') return 'table';
    if (st === 'finished') return 'postgame_player';
    return 'none';
  }
  return requested;
}
