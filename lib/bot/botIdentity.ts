import type { BotName } from '@/lib/bot/botPersonality';
import type { BotPersonalityStyle } from '@/lib/bot/botPersonalityStyle';

export const BOT_USER_IDS: Record<BotName, string> = {
  'Cardi Bot': '10000000-0000-0000-0000-000000000001',
  'Aggro Bot': '10000000-0000-0000-0000-000000000002',
  'Endgame Bot': '10000000-0000-0000-0000-000000000003',
};

/** Production Play Computer Cardi profile (shared DB / preview). */
export const CANONICAL_CARDI_BOT_USER_ID = '9bc30963-68d9-41b7-a442-b38c450301d2';

const BOT_ENV_KEYS = {
  'Cardi Bot': ['BOT_USER_ID_CARDI', 'NEXT_PUBLIC_BOT_USER_ID_CARDI'] as const,
  'Aggro Bot': ['BOT_USER_ID_AGGRO', 'NEXT_PUBLIC_BOT_USER_ID_AGGRO'] as const,
  'Endgame Bot': ['BOT_USER_ID_ENDGAME', 'NEXT_PUBLIC_BOT_USER_ID_ENDGAME'] as const,
};

function envBotId(...keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return null;
}

export function configuredBotUserIds(): Record<BotName, string> {
  return {
    'Cardi Bot':
      envBotId(...BOT_ENV_KEYS['Cardi Bot']) ??
      CANONICAL_CARDI_BOT_USER_ID ??
      BOT_USER_IDS['Cardi Bot'],
    'Aggro Bot': envBotId(...BOT_ENV_KEYS['Aggro Bot']) ?? BOT_USER_IDS['Aggro Bot'],
    'Endgame Bot': envBotId(...BOT_ENV_KEYS['Endgame Bot']) ?? BOT_USER_IDS['Endgame Bot'],
  };
}

/**
 * Authoritative bot host UUIDs for public open-seat exclusion (browser-safe).
 * Union: dev defaults, canonical production Cardi, server + NEXT_PUBLIC env overrides.
 */
export function allKnownBotHostUserIds(): ReadonlySet<string> {
  const ids = new Set<string>(Object.values(BOT_USER_IDS));
  ids.add(CANONICAL_CARDI_BOT_USER_ID);
  for (const name of Object.keys(BOT_USER_IDS) as BotName[]) {
    for (const key of BOT_ENV_KEYS[name]) {
      const v = process.env[key]?.trim();
      if (v) ids.add(v);
    }
  }
  return ids;
}

/** True when `userId` is a configured Play Computer bot profile seat. */
export function isKnownBotHostUserId(userId: string | null | undefined): boolean {
  const id = String(userId ?? '').trim();
  if (!id) return false;
  return allKnownBotHostUserIds().has(id);
}

export function botNameFromUserId(userId: string): BotName | null {
  const id = String(userId ?? '').trim();
  if (!id) return null;
  const hit = (Object.entries(configuredBotUserIds()) as Array<[BotName, string]>).find(([, botId]) => botId === id);
  if (hit) return hit[0];
  if (id === CANONICAL_CARDI_BOT_USER_ID) return 'Cardi Bot';
  if (allKnownBotHostUserIds().has(id)) {
    const byDefault = (Object.entries(BOT_USER_IDS) as Array<[BotName, string]>).find(([, botId]) => botId === id);
    return byDefault?.[0] ?? null;
  }
  return null;
}

/** Maps UI personality style → bot profile seat (black). */
export function botProfileForPersonalityStyle(style: BotPersonalityStyle): BotName {
  switch (style) {
    case 'aggressive':
    case 'trap':
      return 'Aggro Bot';
    case 'defensive':
    case 'endgame':
      return 'Endgame Bot';
    case 'chaos': {
      const names: BotName[] = ['Cardi Bot', 'Aggro Bot', 'Endgame Bot'];
      return names[Math.floor(Math.random() * names.length)]!;
    }
    case 'balanced':
    default:
      return 'Cardi Bot';
  }
}

export function legacyBotNames(): BotName[] {
  return ['Cardi Bot', 'Aggro Bot', 'Endgame Bot'];
}

/** Client + server copy when rejecting join on a bot-hosted public open seat. */
export const PUBLIC_BOT_HOSTED_OPEN_SEAT_JOIN_MESSAGE =
  'This open seat is not available for public matchmaking.';
