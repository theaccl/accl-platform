import { parseBotGameConfigFromGameRow } from '@/lib/bot/botGameConfig';
import {
  COMPUTER_PLAY_PLAT_MODES,
  isValidComputerPlayTimeControl,
  type ComputerPlayPlatMode,
} from '@/lib/freePlayComputerEntry';

export type BotPlayAgainGameRow = {
  source_type?: string | null;
  bot_settings?: unknown;
  rating_last_update?: unknown;
  live_time_control?: string | null;
};

export type BotPlayAgainRequest = {
  difficulty: number;
  personalityStyle: string;
  liveTimeControl: string | null;
  platMode: ComputerPlayPlatMode | null;
};

/**
 * Rebuild the public bot-start request from the finished game's persisted,
 * server-created configuration. The start endpoint remains responsible for
 * authentication, email verification, bot identity, and the unrated insert.
 */
export function botPlayAgainRequestFromGame(
  game: BotPlayAgainGameRow,
): BotPlayAgainRequest | null {
  const config = parseBotGameConfigFromGameRow(game);
  if (!config) return null;
  const liveTimeControl = game.live_time_control?.trim() || null;
  const platMode = liveTimeControl
    ? COMPUTER_PLAY_PLAT_MODES.find((mode) =>
        isValidComputerPlayTimeControl(mode, liveTimeControl),
      ) ?? null
    : null;

  if (liveTimeControl && !platMode) return null;

  return {
    difficulty: config.accl_bot_v1.difficulty,
    personalityStyle: config.accl_bot_v1.personalityStyle,
    liveTimeControl,
    platMode,
  };
}
