import { parseBotGameConfigFromGameRow } from '@/lib/bot/botGameConfig';

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

  return {
    difficulty: config.accl_bot_v1.difficulty,
    personalityStyle: config.accl_bot_v1.personalityStyle,
    liveTimeControl: game.live_time_control?.trim() || null,
  };
}
