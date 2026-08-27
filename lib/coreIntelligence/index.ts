export { CORE_ROLES, PLAYER_MODEL_PROJECTIONS, CAPABILITY_BOOLEAN_KEYS, GAME_CLASSIFICATION_KINDS } from './types';
export type {
  CoreRole,
  PlayerModelProjection,
  CapabilityEnvelope,
  CapabilityBooleanKey,
  RoleInstance,
  PersonaDefinition,
  HandoffPacket,
  GameClassification,
  GameClassificationKind,
  AuthoritativeGameSnapshot,
  UntrustedCallerAuthorizationInput,
  ServerGameSurface,
} from './types';

export { isCoreRole, defaultProjectionForRole } from './roles';
export { ROLE_INVARIANT_FLOORS, applyRoleInvariantFloors } from './roleInvariantPolicy';
export {
  classifyAuthoritativeGame,
  isActiveGameClassification,
  isHumanLiveOrCorrespondenceClassification,
} from './gameClassification';
export type { ClassifyAuthoritativeGameInput } from './gameClassification';
export {
  closedCapabilityEnvelope,
  computeCapabilityEnvelope,
  albertPresenceDeniedByClassification,
} from './computeCapabilityEnvelope';
export { createRoleInstance } from './roleSession';
export { assertPersonaDefinitionHasNoPlayerModel, PERSONA_DEFINITIONS } from './personaDefinition';
export {
  createSanitizedHandoffPacket,
  transitionRoleSession,
  InMemoryHandoffNonceStore,
} from './handoff';
export type { HandoffNonceStore, TransitionRoleResult } from './handoff';
export { authorizePlayerModelProjection } from './playerModelProjectionAccess';
export { loadSeatedAuthoritativeGamesForPlayer } from './loadSeatedGamesForAuthorization';
export type { LoadSeatedGamesResult } from './loadSeatedGamesForAuthorization';
export { evaluateAlbertRouteAccess } from './albertRouteAccess';
export type { AlbertRouteAccessResult } from './albertRouteAccess';
