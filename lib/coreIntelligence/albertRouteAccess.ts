import { albertPresenceDeniedByClassification, classifyAuthoritativeGame } from './gameClassification';
import type { LoadSeatedGamesResult } from './loadSeatedGamesForAuthorization';
import type { AuthoritativeGameSnapshot, UntrustedCallerAuthorizationInput } from './types';

export type AlbertRouteAccessResult =
  | { allowed: true }
  | {
      allowed: false;
      code: 'albert_blocked_active_game' | 'albert_presence_unresolved' | 'albert_lookup_failed';
    };

export function evaluateAlbertRouteAccess(input: {
  loadResult: LoadSeatedGamesResult;
  untrustedCaller?: UntrustedCallerAuthorizationInput;
  nowMs?: number;
}): AlbertRouteAccessResult {
  if (!input.loadResult.ok) {
    return { allowed: false, code: 'albert_lookup_failed' };
  }
  for (const game of input.loadResult.rows) {
    const classification = classifyAuthoritativeGame({
      game,
      gameExpected: true,
      untrustedCaller: input.untrustedCaller,
      nowMs: input.nowMs,
    });
    if (albertPresenceDeniedByClassification(classification)) {
      return {
        allowed: false,
        code:
          classification.kind === 'unresolved' ? 'albert_presence_unresolved' : 'albert_blocked_active_game',
      };
    }
  }
  return { allowed: true };
}

export function snapshotsDenyAlbertPresence(rows: AuthoritativeGameSnapshot[]): boolean {
  return evaluateAlbertRouteAccess({ loadResult: { ok: true, rows } }).allowed === false;
}
