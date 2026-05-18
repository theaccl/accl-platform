import type { GameMoveLogInsertRow } from '@/lib/replay/gameMoveLogInsert';

export type RpcMoveLogPayload = {
  game_id: string;
  player_id: string;
  san: string;
  from_sq: string;
  to_sq: string;
  fen_before: string | null;
  fen_after: string;
  move_duration_ms: number;
  idempotency_key?: string;
};

export type RpcMoveLogBuildOptions = {
  idempotencyKey?: string | null;
};

export function buildRpcMoveLogPayload(
  row: GameMoveLogInsertRow,
  options?: RpcMoveLogBuildOptions,
): RpcMoveLogPayload {
  const key = String(options?.idempotencyKey ?? '').trim();
  const base: RpcMoveLogPayload = {
    game_id: row.game_id,
    player_id: row.player_id,
    san: row.san,
    from_sq: row.from_sq,
    to_sq: row.to_sq,
    fen_before: row.fen_before,
    fen_after: row.fen_after,
    move_duration_ms: row.move_duration_ms ?? 0,
  };
  if (key) {
    base.idempotency_key = key;
  }
  return base;
}

export type RpcMoveLogValidationResult =
  | { ok: true; payload: RpcMoveLogPayload }
  | { ok: false; message: string };

/**
 * Client-side guard before RPC — mirrors DB `move_log_invalid_payload` checks.
 */
export function validateRpcMoveLogPayload(
  gameId: string,
  row: GameMoveLogInsertRow,
  options?: RpcMoveLogBuildOptions,
): RpcMoveLogValidationResult {
  const gid = String(gameId ?? '').trim();
  if (!gid) {
    return { ok: false, message: 'game_id is required.' };
  }
  if (String(row.game_id ?? '').trim() !== gid) {
    return { ok: false, message: 'move log game_id must match p_game_id.' };
  }
  if (!String(row.player_id ?? '').trim()) {
    return { ok: false, message: 'player_id is required.' };
  }
  if (!String(row.san ?? '').trim()) {
    return { ok: false, message: 'san is required.' };
  }
  if (!String(row.from_sq ?? '').trim()) {
    return { ok: false, message: 'from_sq is required.' };
  }
  if (!String(row.to_sq ?? '').trim()) {
    return { ok: false, message: 'to_sq is required.' };
  }
  if (!String(row.fen_after ?? '').trim()) {
    return { ok: false, message: 'fen_after is required.' };
  }
  const duration = row.move_duration_ms;
  if (duration != null && (!Number.isFinite(duration) || duration < 0)) {
    return { ok: false, message: 'move_duration_ms must be a non-negative number.' };
  }
  const key = String(options?.idempotencyKey ?? '').trim();
  if (key.length > 240) {
    return { ok: false, message: 'idempotency_key is too long.' };
  }
  return { ok: true, payload: buildRpcMoveLogPayload(row, options) };
}
