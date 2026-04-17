import { type ChatChannel, isAllowedLobbyRoom } from './chatChannels';

export type GamePolicyInput = {
  status: string;
  white_player_id: string;
  black_player_id: string | null;
  /** When set, must be `live` for in-game spectator chat (daily/correspondence have no spectator channel). */
  tempo?: string | null;
};

export function isGameParticipant(game: GamePolicyInput, userId: string): boolean {
  const u = userId.trim();
  if (!u) return false;
  if (game.white_player_id === u) return true;
  if (game.black_player_id && game.black_player_id === u) return true;
  return false;
}

export function isGameFinished(game: Pick<GamePolicyInput, 'status'>): boolean {
  return String(game.status).trim() === 'finished';
}

/** Real-time (clock) games only — spectator chat is disabled for daily/correspondence. */
export function isLiveTempoGame(game: Pick<GamePolicyInput, 'tempo'>): boolean {
  return String(game.tempo ?? '').trim().toLowerCase() === 'live';
}

/**
 * Player chat read: participants only, and only after the game has finished (no side channel during play).
 */
export function canAccessPlayerChat(game: GamePolicyInput, userId: string): boolean {
  return isGameParticipant(game, userId) && isGameFinished(game);
}

/**
 * Spectator chat read: only for live-tempo games (API still enforces ecosystem / spectate for non-participants).
 */
export function canReadSpectatorChat(game: GamePolicyInput, userId: string): boolean {
  void userId;
  return isLiveTempoGame(game);
}

/**
 * Spectator chat write: same as read — live games only; during play, this is the only in-game chat channel.
 */
export function canPostSpectatorChat(game: GamePolicyInput, userId: string): boolean {
  void userId;
  return isLiveTempoGame(game);
}

/**
 * Player chat write: participants only, after finish (post-game thread).
 */
export function canPostPlayerChat(game: GamePolicyInput, userId: string): boolean {
  return isGameParticipant(game, userId) && isGameFinished(game);
}

export function assertChannelPayload(
  channel: ChatChannel,
  gameId: string | null,
  lobbyRoom: string | null,
  dmThreadId: string | null
): void {
  if (channel === 'game_spectator' || channel === 'game_player') {
    if (!gameId?.trim()) throw new Error('gameId required');
    if (lobbyRoom || dmThreadId) throw new Error('invalid scope');
    return;
  }
  if (channel === 'lobby') {
    if (!lobbyRoom?.trim()) throw new Error('lobbyRoom required');
    if (!isAllowedLobbyRoom(lobbyRoom)) throw new Error('invalid_lobby_room');
    if (gameId || dmThreadId) throw new Error('invalid scope');
    return;
  }
  if (channel === 'dm') {
    if (!dmThreadId?.trim()) throw new Error('dmThreadId required');
    if (gameId || lobbyRoom) throw new Error('invalid scope');
  }
}
