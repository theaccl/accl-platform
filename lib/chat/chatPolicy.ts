import { normalizeGameTempo } from '@/lib/gameTempo';

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

/** Live game still on the board (includes waiting for Black). */
export function isLiveGameInPlay(game: Pick<GamePolicyInput, 'status' | 'tempo'>): boolean {
  if (!isLiveTempoGame(game)) return false;
  const st = String(game.status ?? '').trim().toLowerCase();
  return st === 'active' || st === 'waiting';
}

/** Daily or correspondence — same in-board / waiting lifecycle as live, but no spectator chat channel. */
export function isDailyOrCorrespondenceGameInPlay(game: Pick<GamePolicyInput, 'status' | 'tempo'>): boolean {
  const t = normalizeGameTempo(game.tempo);
  if (t !== 'daily' && t !== 'correspondence') return false;
  const st = String(game.status ?? '').trim().toLowerCase();
  return st === 'active' || st === 'waiting';
}

/**
 * Player chat read: participants only — during live play (`game_player`) or post-game (`game_player` archive).
 */
export function canAccessPlayerChat(game: GamePolicyInput, userId: string): boolean {
  if (!isGameParticipant(game, userId)) return false;
  return isGameFinished(game) || isLiveGameInPlay(game) || isDailyOrCorrespondenceGameInPlay(game);
}

/**
 * Spectator chat read: live games only, and **not** seated players (they use `game_player` during play).
 */
export function canReadSpectatorChat(game: GamePolicyInput, userId: string): boolean {
  if (!isLiveTempoGame(game)) return false;
  return !isGameParticipant(game, userId);
}

/**
 * Spectator chat write: live games only; never seated players (table chat is `game_player`).
 */
export function canPostSpectatorChat(game: GamePolicyInput, userId: string): boolean {
  return canReadSpectatorChat(game, userId);
}

/**
 * Player chat write: same gates as read for game-scoped channels.
 */
export function canPostPlayerChat(game: GamePolicyInput, userId: string): boolean {
  return canAccessPlayerChat(game, userId);
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
