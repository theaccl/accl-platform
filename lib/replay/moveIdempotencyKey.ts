/**
 * Idempotency keys for transactional move logs (Phase 1F).
 * Prefer client_move_id when present; otherwise deterministic from position + squares.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MoveIdempotencyKeyInput = {
  gameId: string;
  fenBefore: string;
  playerId: string;
  fromSq: string;
  toSq: string;
  promotion?: string | null;
  clientMoveId?: string | null;
};

function normFen(fen: string): string {
  return String(fen ?? '').trim();
}

function normSq(sq: string): string {
  return String(sq ?? '').trim().toLowerCase();
}

function normPromotion(promotion?: string | null): string {
  const p = String(promotion ?? '').trim().toLowerCase();
  return p === 'q' || p === 'r' || p === 'b' || p === 'n' ? p : '-';
}

/** Max length for DB column + index (keep headroom under Postgres index limits). */
const MAX_KEY_LEN = 240;

function truncateKey(key: string): string {
  if (key.length <= MAX_KEY_LEN) return key;
  return key.slice(0, MAX_KEY_LEN);
}

/**
 * Build a stable idempotency key for one ply attempt.
 * Same client_move_id always maps to the same key; otherwise position + squares identify the slot.
 */
export function buildMoveIdempotencyKey(input: MoveIdempotencyKeyInput): string {
  const clientMoveId = String(input.clientMoveId ?? '').trim();
  if (clientMoveId && UUID_RE.test(clientMoveId)) {
    return truncateKey(`cm:${clientMoveId}`);
  }

  const gameId = String(input.gameId ?? '').trim();
  const fenBefore = normFen(input.fenBefore);
  const playerId = String(input.playerId ?? '').trim();
  const fromSq = normSq(input.fromSq);
  const toSq = normSq(input.toSq);
  const promotion = normPromotion(input.promotion);

  return truncateKey(`mv:${gameId}:${fenBefore}:${playerId}:${fromSq}:${toSq}:${promotion}`);
}

export function isValidClientMoveId(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  return UUID_RE.test(s);
}
