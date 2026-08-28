/**
 * Albert Slice 1 — server-domain contracts.
 * These types are never client, LLM, or handoff-packet authority.
 */

export const CORE_ROLES = [
  'ALBERT_ASSISTANT',
  'TRAINER_PERSONA',
  'BOT_LADDER_PERSONA',
  'ASI_ARENA',
] as const;

export type CoreRole = (typeof CORE_ROLES)[number];

export const PLAYER_MODEL_PROJECTIONS = ['none', 'coaching', 'training', 'bot-ladder'] as const;

export type PlayerModelProjection = (typeof PLAYER_MODEL_PROJECTIONS)[number];

export const CAPABILITY_BOOLEAN_KEYS = [
  'canAnalyzeCompletedGames',
  'canAccessTrainingPositions',
  'canCoachOrAnalyzeHumanLiveGame',
  'canCoachOrAnalyzeHumanCorrespondenceGame',
  'canProvideSeparateAiAssistanceInBotLadderGame',
  'canBePresentAsAlbertDuringAnyActiveGame',
  'canParticipateAsOpponentInAsiArena',
  'canUseCompetitionEngine',
  'canSelfLearnInSandbox',
] as const;

export type CapabilityBooleanKey = (typeof CAPABILITY_BOOLEAN_KEYS)[number];

export type CapabilityEnvelope = {
  playerModelProjection: PlayerModelProjection;
  canAnalyzeCompletedGames: boolean;
  canAccessTrainingPositions: boolean;
  canCoachOrAnalyzeHumanLiveGame: boolean;
  canCoachOrAnalyzeHumanCorrespondenceGame: boolean;
  canProvideSeparateAiAssistanceInBotLadderGame: boolean;
  canBePresentAsAlbertDuringAnyActiveGame: boolean;
  canParticipateAsOpponentInAsiArena: boolean;
  canUseCompetitionEngine: boolean;
  canSelfLearnInSandbox: boolean;
};

export type RoleInstance = {
  readonly playerId: string;
  readonly role: CoreRole;
  readonly personaId: string | null;
  readonly roleSessionId: string;
  readonly createdAt: string;
  readonly envelope: CapabilityEnvelope;
};

export type PersonaDefinition = {
  id: string;
  role: CoreRole;
  displayName: string;
  styleNotes: string | null;
};

/** Server-constructed sanitized persona-transition packet. */
export type HandoffPacket = {
  playerId: string;
  sourceRole: CoreRole;
  sourceRoleSessionId: string;
  destinationRole: CoreRole;
  destinationPersonaId: string | null;
  reason: string;
  lessonOrTaskContext: string | null;
  permittedPlayerModelRefs: readonly string[];
  completedGameOrTrainingIds: readonly string[];
  issuedAt: string;
  nonce: string;
};

export const GAME_CLASSIFICATION_KINDS = [
  'none',
  'unresolved',
  'completed',
  'training-sandbox',
  'bot-ladder-active',
  'asi-arena-active',
  'human-live-active',
  'human-correspondence-active',
  'human-daily-active',
  'play-computer-active',
  'other-active',
] as const;

export type GameClassificationKind = (typeof GAME_CLASSIFICATION_KINDS)[number];

export type UnresolvedClassificationReason = 'missing' | 'stale' | 'contradictory' | 'unrecognized';

export type GameClassification =
  | { kind: 'unresolved'; reason: UnresolvedClassificationReason }
  | { kind: Exclude<GameClassificationKind, 'unresolved'> };

/**
 * Authoritative snapshot of `public.games` columns used by Slice 1 classification.
 * Must be loaded from server game records, never from client labels.
 */
export type AuthoritativeGameSnapshot = {
  id: string;
  status: string | null;
  tempo: string | null;
  play_context: string | null;
  mode: string | null;
  source_type: string | null;
  rated: boolean | null;
  tournament_id: string | null;
  bot_settings: unknown;
  white_player_id: string | null;
  black_player_id: string | null;
  stale?: boolean;
  observedAtMs?: number;
};

export type ServerGameSurface = 'none' | 'trainer-sandbox';

/** Untrusted client/LLM/persona fields. May be present; never used as authorization. */
export type UntrustedCallerAuthorizationInput = {
  gameType?: unknown;
  mode?: unknown;
  classification?: unknown;
  completed?: unknown;
  training?: unknown;
  capabilities?: unknown;
  playerId?: unknown;
  playerModelId?: unknown;
};

export const ACTIVE_GAME_CLASSIFICATION_KINDS = [
  'bot-ladder-active',
  'asi-arena-active',
  'human-live-active',
  'human-correspondence-active',
  'human-daily-active',
  'play-computer-active',
  'other-active',
] as const satisfies readonly GameClassificationKind[];
