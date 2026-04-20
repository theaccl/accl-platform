import { PLAT_MODE_LABELS, type PlatMode } from '@/lib/freePlayModeTimeControl';

/** Server `lobby_room` keys for free-play mode chat (one room per mode, not per clock). */
export const FREE_PLAY_LOBBY_ROOM_BY_MODE: Record<PlatMode, string> = {
  bullet: 'free_lobby_bullet',
  blitz: 'free_lobby_blitz',
  rapid: 'free_lobby_rapid',
  daily: 'free_lobby_daily',
};

/** Hub-level lobby chat (optional general conversation). */
export const FREE_PLAY_LOBBY_GENERAL_ROOM = 'free_lobby_general' as const;

export function lobbyModeLabel(mode: PlatMode): string {
  return PLAT_MODE_LABELS[mode] ?? mode;
}
