/**
 * ACCL tester-phase communication channels (policy + API contract).
 * Separates spectator discussion from player-only chat, lobby coordination, and DMs.
 */
export const CHAT_CHANNELS = {
  GAME_SPECTATOR: 'game_spectator',
  GAME_PLAYER: 'game_player',
  LOBBY: 'lobby',
  DM: 'dm',
} as const;

export type ChatChannel = (typeof CHAT_CHANNELS)[keyof typeof CHAT_CHANNELS];

export const DEFAULT_LOBBY_ROOM = 'global';
