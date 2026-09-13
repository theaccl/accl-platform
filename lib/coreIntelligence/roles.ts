import { CORE_ROLES, type CoreRole } from './types';

export function isCoreRole(value: unknown): value is CoreRole {
  return typeof value === 'string' && (CORE_ROLES as readonly string[]).includes(value);
}

export function defaultProjectionForRole(role: CoreRole) {
  switch (role) {
    case 'ALBERT_ASSISTANT':
      return 'coaching' as const;
    case 'TRAINER_PERSONA':
      return 'training' as const;
    case 'BOT_LADDER_PERSONA':
      return 'bot-ladder' as const;
    case 'ASI_ARENA':
      return 'none' as const;
  }
}
