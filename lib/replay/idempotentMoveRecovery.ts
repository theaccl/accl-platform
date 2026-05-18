import type { SupabaseClient } from '@supabase/supabase-js';

export type CommittedMoveLogRow = {
  id: string;
  game_id: string;
  player_id: string;
  san: string;
  from_sq: string | null;
  to_sq: string | null;
  fen_before: string | null;
  fen_after: string | null;
  idempotency_key: string | null;
};

export type IdempotentLogLookup =
  | { found: false }
  | { found: true; log: CommittedMoveLogRow };

/**
 * Load an existing move log by idempotency key (service role).
 */
export async function findCommittedMoveLogByKey(
  supabase: SupabaseClient,
  gameId: string,
  idempotencyKey: string,
): Promise<IdempotentLogLookup> {
  const key = String(idempotencyKey ?? '').trim();
  if (!key) return { found: false };

  const { data, error } = await supabase
    .from('game_move_logs')
    .select('id, game_id, player_id, san, from_sq, to_sq, fen_before, fen_after, idempotency_key')
    .eq('game_id', gameId)
    .eq('idempotency_key', key)
    .maybeSingle();

  if (error || !data) return { found: false };
  return { found: true, log: data as CommittedMoveLogRow };
}

export type IdempotentPayloadMatch =
  | { ok: true }
  | { ok: false; message: string };

/** Ensure a committed log row matches the move we intended to apply. */
export function committedLogMatchesPayload(
  log: CommittedMoveLogRow,
  expected: {
    playerId: string;
    fromSq: string;
    toSq: string;
    fenBefore: string | null;
    fenAfter: string;
  },
): IdempotentPayloadMatch {
  if (String(log.player_id) !== String(expected.playerId)) {
    return { ok: false, message: 'Idempotency key reused with a different player.' };
  }
  if (normSq(log.from_sq) !== normSq(expected.fromSq) || normSq(log.to_sq) !== normSq(expected.toSq)) {
    return { ok: false, message: 'Idempotency key reused with different move squares.' };
  }
  const logBefore = String(log.fen_before ?? '').trim();
  const expBefore = String(expected.fenBefore ?? '').trim();
  if (logBefore && expBefore && logBefore !== expBefore) {
    return { ok: false, message: 'Idempotency key reused from a different position.' };
  }
  if (String(log.fen_after ?? '').trim() !== String(expected.fenAfter).trim()) {
    return { ok: false, message: 'Idempotency key reused with a different resulting position.' };
  }
  return { ok: true };
}

function normSq(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toLowerCase();
}
