import { CORE_ROLES, type CoreRole, type PersonaDefinition } from './types';

const FORBIDDEN_PERSONA_KEYS = [
  'playerId',
  'player_id',
  'playerModel',
  'player_model',
  'history',
  'coachingNotes',
  'privateContext',
] as const;

export function assertPersonaDefinitionHasNoPlayerModel(
  value: PersonaDefinition | Record<string, unknown>,
): PersonaDefinition {
  for (const key of FORBIDDEN_PERSONA_KEYS) {
    if (key in value && (value as Record<string, unknown>)[key] != null) {
      throw new Error('persona_must_not_embed_player_model');
    }
  }
  const id = String((value as PersonaDefinition).id ?? '').trim();
  const displayName = String((value as PersonaDefinition).displayName ?? '').trim();
  const role = (value as PersonaDefinition).role;
  if (!id || !displayName) throw new Error('persona_invalid');
  if (!(CORE_ROLES as readonly string[]).includes(role)) throw new Error('persona_invalid_role');
  return {
    id,
    role: role as CoreRole,
    displayName,
    styleNotes:
      typeof (value as PersonaDefinition).styleNotes === 'string'
        ? (value as PersonaDefinition).styleNotes
        : null,
  };
}

/** Catalog identities only. No player-private fields. */
export const PERSONA_DEFINITIONS: readonly PersonaDefinition[] = [
  {
    id: 'albert-default',
    role: 'ALBERT_ASSISTANT',
    displayName: 'Albert',
    styleNotes: 'advisory mentor outside active play',
  },
  {
    id: 'trainer-default',
    role: 'TRAINER_PERSONA',
    displayName: 'Trainer',
    styleNotes: 'training and curriculum lane',
  },
  {
    id: 'bot-ladder-default',
    role: 'BOT_LADDER_PERSONA',
    displayName: 'Bot Ladder opponent',
    styleNotes: 'future opponent lane stub',
  },
  {
    id: 'asi-arena-default',
    role: 'ASI_ARENA',
    displayName: 'ASI Arena',
    styleNotes: 'board-only arena opponent stub',
  },
];
