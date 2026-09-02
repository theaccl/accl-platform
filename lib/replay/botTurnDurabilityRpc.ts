import type { RpcMoveLogPayload } from '@/lib/replay/rpcMoveLogPayload';

export type ReservedBotTurn = {
  game: Record<string, unknown>;
  jobId: string;
  jobStatus: string;
};

export type AppliedQueuedBotTurn = {
  game: Record<string, unknown>;
  botMoveApplied: boolean;
  timedOut: boolean;
  jobStatus: string;
};

function objectValue(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

export function parseReservedBotTurn(raw: unknown): ReservedBotTurn | null {
  const value = objectValue(raw);
  const game = objectValue(value?.game);
  const jobId = String(value?.job_id ?? '').trim();
  if (!game || !jobId) return null;
  return {
    game,
    jobId,
    jobStatus: String(value?.job_status ?? '').trim(),
  };
}

export function parseAppliedQueuedBotTurn(raw: unknown): AppliedQueuedBotTurn | null {
  const value = objectValue(raw);
  const game = objectValue(value?.game);
  if (!game) return null;
  return {
    game,
    botMoveApplied: value?.bot_move_applied === true,
    timedOut: value?.timed_out === true,
    jobStatus: String(value?.job_status ?? '').trim(),
  };
}

export function buildBotTurnReservationRpcParams(input: {
  gameId: string;
  expectedFen: string;
  humanPatch: {
    fen: string;
    turn: string;
    lastMoveAt: string | null;
    moveDeadlineAt: string | null;
    whiteClockMs: number | null;
    blackClockMs: number | null;
    promoteWaitingToActive: boolean;
  };
  humanMoveLog: RpcMoveLogPayload;
  correlationId: string | null;
}) {
  return {
    p_game_id: input.gameId,
    p_expected_fen: input.expectedFen,
    p_human_next_fen: input.humanPatch.fen,
    p_human_next_turn: input.humanPatch.turn,
    p_human_last_move_at: input.humanPatch.lastMoveAt,
    p_human_move_deadline_at: input.humanPatch.moveDeadlineAt,
    p_human_white_clock_ms: input.humanPatch.whiteClockMs,
    p_human_black_clock_ms: input.humanPatch.blackClockMs,
    p_human_promote_waiting_to_active: input.humanPatch.promoteWaitingToActive,
    p_human_move_log: input.humanMoveLog,
    p_correlation_id: input.correlationId,
  };
}

export function buildApplyQueuedBotMoveRpcParams(input: {
  jobId: string;
  selectedUci: string;
  thinkMs: number;
  botPatch: {
    fen: string;
    turn: string;
    lastMoveAt: string | null;
    moveDeadlineAt: string | null;
    whiteClockMs: number | null;
    blackClockMs: number | null;
  };
  botTerminal: { result: string; endReason: string } | null;
  botMoveLog: RpcMoveLogPayload;
}) {
  return {
    p_job_id: input.jobId,
    p_selected_uci: input.selectedUci,
    p_think_ms: input.thinkMs,
    p_bot_next_fen: input.botPatch.fen,
    p_bot_next_turn: input.botPatch.turn,
    p_bot_last_move_at: input.botPatch.lastMoveAt,
    p_bot_move_deadline_at: input.botPatch.moveDeadlineAt,
    p_bot_white_clock_ms: input.botPatch.whiteClockMs,
    p_bot_black_clock_ms: input.botPatch.blackClockMs,
    p_bot_result: input.botTerminal?.result ?? null,
    p_bot_end_reason: input.botTerminal?.endReason ?? null,
    p_bot_move_log: input.botMoveLog,
  };
}
