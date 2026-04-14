import type { ChatChannel } from './chatChannels';

export type GamePolicyInput = {
  status: string;
  white_player_id: string;
  black_player_id: string | null;
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

/**
 * Player chat: participants only, any game phase.
 */
export function canAccessPlayerChat(game: GamePolicyInput, userId: string): boolean {
  return isGameParticipant(game, userId);
}

/**
 * Spectator chat read: non-participants always (subject to ecosystem / spectate rules in API).
 * Participants may read only after the game is finished (default: hide during active play).
 */
export function canReadSpectatorChat(game: GamePolicyInput, userId: string): boolean {
  if (isGameParticipant(game, userId)) return isGameFinished(game);
  return true;
}

/**
 * Spectator chat write: non-participants, or participants only after finish (no dual-role noise mid-game).
 */
export function canPostSpectatorChat(game: GamePolicyInput, userId: string): boolean {
  if (isGameParticipant(game, userId)) return isGameFinished(game);
  return true;
}

/**
 * Player chat write: participants only.
 */
export function canPostPlayerChat(game: GamePolicyInput, userId: string): boolean {
  return isGameParticipant(game, userId);
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
    if (gameId || dmThreadId) throw new Error('invalid scope');
    return;
  }
  if (channel === 'dm') {
    if (!dmThreadId?.trim()) throw new Error('dmThreadId required');
    if (gameId || lobbyRoom) throw new Error('invalid scope');
  }
}
