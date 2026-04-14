/**
 * /game/[id] visibility — pure helpers for route UX (no I/O).
 */

export type GamePublicRouteHint = 'missing' | 'ecosystem_mismatch' | 'sign_in_required';

export type GameRouteAccessKind =
  | 'loading'
  | 'ok'
  | 'not_found'
  | 'sign_in_required'
  | 'ecosystem_mismatch'
  | 'spectate_unavailable';

/** Map RPC hint string to access state for logged-out users when public spectate snapshot is null. */
export function accessFromPublicHint(hint: string | null | undefined): GameRouteAccessKind {
  const h = String(hint ?? '').trim();
  if (h === 'missing') return 'not_found';
  if (h === 'ecosystem_mismatch') return 'ecosystem_mismatch';
  return 'sign_in_required';
}

/** True when the page should use the public spectate RPC instead of direct games row fetch. */
export function shouldUsePublicSpectateRpc(params: {
  publicSpectateUrlFlag: boolean;
  userId: string | null | undefined;
}): boolean {
  return params.publicSpectateUrlFlag || !params.userId;
}
