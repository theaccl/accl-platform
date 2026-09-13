import { defaultProjectionForRole } from './roles';
import type { CoreRole, PlayerModelProjection } from './types';

export type PlayerModelProjectionRequest = {
  authenticatedPlayerId: string;
  requestedPlayerId: unknown;
  role: CoreRole;
  /** Ignored. Persona does not determine player identity. */
  personaId?: unknown;
  /** Ignored. Handoff packets do not determine player identity. */
  handoffPlayerId?: unknown;
};

export type PlayerModelProjectionAccessResult =
  | { ok: true; playerId: string; projection: PlayerModelProjection }
  | { ok: false; code: 'unauthenticated' | 'cross_player' };

/**
 * Authorization contract only. Does not load or return Player Model contents.
 * There is no "load any player model by ID" path.
 */
export function authorizePlayerModelProjection(
  input: PlayerModelProjectionRequest,
): PlayerModelProjectionAccessResult {
  const authenticated = String(input.authenticatedPlayerId ?? '').trim();
  if (!authenticated) return { ok: false, code: 'unauthenticated' };
  const requested = String(input.requestedPlayerId ?? '').trim();
  if (!requested || requested !== authenticated) return { ok: false, code: 'cross_player' };
  void input.personaId;
  void input.handoffPlayerId;
  return {
    ok: true,
    playerId: authenticated,
    projection: defaultProjectionForRole(input.role),
  };
}
