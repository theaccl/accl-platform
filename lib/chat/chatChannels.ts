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

/** Mode-specific free-play lobby buckets (P2). General hub chat (not time-scoped). */
export const FREE_LOBBY_ROOMS = [
  'free_lobby_general',
  'free_lobby_bullet',
  'free_lobby_blitz',
  'free_lobby_rapid',
  'free_lobby_daily',
] as const;

/** Pre–mode-split bucket; still accepted for reads/writes. */
export const LEGACY_LOBBY_ROOMS = ['global'] as const;

export const DEFAULT_LOBBY_ROOM = 'global';

export function isAllowedLobbyRoom(room: string | null | undefined): boolean {
  const t = String(room ?? '').trim();
  if (!t) return false;
  return (
    (FREE_LOBBY_ROOMS as readonly string[]).includes(t) ||
    (LEGACY_LOBBY_ROOMS as readonly string[]).includes(t)
  );
}
