import type { BotDifficultyLevel } from '@/lib/bot/botDifficulty';
import { normalizeBotDifficultyLevel } from '@/lib/bot/botDifficulty';
import type { BotPersonalityStyle } from '@/lib/bot/botPersonalityStyle';
import { normalizeBotPersonalityStyle } from '@/lib/bot/botPersonalityStyle';

/** Runtime shape used by bot move / submit-move logic. */
export type BotGameConfigV1 = {
  accl_bot_v1: {
    difficulty: BotDifficultyLevel;
    personalityStyle: BotPersonalityStyle;
    /** Display label at start (legacy bot name or personality). */
    opponentLabel: string;
  };
};

/** Persisted on `games.bot_settings` for new bot games. */
export type BotSettingsDocument = {
  version: 'accl_bot_v1';
  difficulty: BotDifficultyLevel;
  personalityStyle: BotPersonalityStyle;
  opponentLabel: string;
  botProfileId?: string;
  createdFrom?: string;
  migratedFrom?: string;
};

export type BotGameConfigRowFields = {
  bot_settings?: unknown;
  rating_last_update?: unknown;
};

function parseV1FieldsFromStorage(raw: unknown): BotGameConfigV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const nested = o.accl_bot_v1;
  const src =
    nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : o;

  const hasFlatV1 =
    String(o.version ?? '') === 'accl_bot_v1' ||
    (typeof src.difficulty !== 'undefined' && typeof src.personalityStyle !== 'undefined');
  const hasNestedV1 = nested && typeof nested === 'object';

  if (!hasFlatV1 && !hasNestedV1) return null;

  return {
    accl_bot_v1: {
      difficulty: normalizeBotDifficultyLevel(src.difficulty),
      personalityStyle: normalizeBotPersonalityStyle(src.personalityStyle),
      opponentLabel: String(src.opponentLabel ?? 'Computer').trim() || 'Computer',
    },
  };
}

export function parseBotGameConfigFromGameRow(row: {
  source_type?: string | null;
  bot_settings?: unknown;
  rating_last_update?: unknown;
}): BotGameConfigV1 | null {
  if (String(row.source_type ?? '') !== 'bot_game') return null;
  return (
    parseV1FieldsFromStorage(row.bot_settings) ?? parseV1FieldsFromStorage(row.rating_last_update)
  );
}

export function botSettingsDocumentFromConfig(
  config: BotGameConfigV1,
  extras?: { botProfileId?: string; createdFrom?: string },
): BotSettingsDocument {
  const v1 = config.accl_bot_v1;
  return {
    version: 'accl_bot_v1',
    difficulty: v1.difficulty,
    personalityStyle: v1.personalityStyle,
    opponentLabel: v1.opponentLabel,
    ...(extras?.botProfileId ? { botProfileId: extras.botProfileId } : {}),
    ...(extras?.createdFrom ? { createdFrom: extras.createdFrom } : {}),
  };
}

/** Insert payload for new bot games — writes `bot_settings` only. */
export function encodeBotGameConfigRow(
  config: BotGameConfigV1,
  extras?: { botProfileId?: string; createdFrom?: string },
): { bot_settings: BotSettingsDocument } {
  return { bot_settings: botSettingsDocumentFromConfig(config, extras) };
}

/** @deprecated Legacy write path; do not use for new games. */
export function encodeBotGameConfigRowLegacyRatingColumn(
  config: BotGameConfigV1,
): { rating_last_update: BotGameConfigV1 } {
  return { rating_last_update: config };
}

export function defaultBotGameConfig(
  difficulty: BotDifficultyLevel,
  personalityStyle: BotPersonalityStyle,
  opponentLabel: string,
): BotGameConfigV1 {
  return {
    accl_bot_v1: {
      difficulty,
      personalityStyle,
      opponentLabel,
    },
  };
}

export function ratingLastUpdateContainsBotConfig(ratingLastUpdate: unknown): boolean {
  if (!ratingLastUpdate || typeof ratingLastUpdate !== 'object') return false;
  return 'accl_bot_v1' in (ratingLastUpdate as Record<string, unknown>);
}
