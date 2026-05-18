import type { BotName } from '@/lib/bot/botPersonality';
import type { BotPersonalityStyle } from '@/lib/bot/botPersonalityStyle';

export const BOT_USER_IDS: Record<BotName, string> = {
  'Cardi Bot': '10000000-0000-0000-0000-000000000001',
  'Aggro Bot': '10000000-0000-0000-0000-000000000002',
  'Endgame Bot': '10000000-0000-0000-0000-000000000003',
};

export function configuredBotUserIds(): Record<BotName, string> {
  return {
    'Cardi Bot': process.env.BOT_USER_ID_CARDI?.trim() || BOT_USER_IDS['Cardi Bot'],
    'Aggro Bot': process.env.BOT_USER_ID_AGGRO?.trim() || BOT_USER_IDS['Aggro Bot'],
    'Endgame Bot': process.env.BOT_USER_ID_ENDGAME?.trim() || BOT_USER_IDS['Endgame Bot'],
  };
}

export function botNameFromUserId(userId: string): BotName | null {
  const hit = (Object.entries(configuredBotUserIds()) as Array<[BotName, string]>).find(([, id]) => id === userId);
  return hit?.[0] ?? null;
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
