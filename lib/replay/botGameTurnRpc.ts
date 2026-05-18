import type { RpcMoveLogPayload } from '@/lib/replay/rpcMoveLogPayload';

export type BotGameTurnRpcParams = {
  p_game_id: string;
  p_expected_fen: string;
  p_human_next_fen: string;
  p_human_next_turn: string;
  p_human_last_move_at: string | null;
  p_human_move_deadline_at: string | null;
  p_human_white_clock_ms: number | null;
  p_human_black_clock_ms: number | null;
  p_human_promote_waiting_to_active: boolean;
  p_human_result: string | null;
  p_human_end_reason: string | null;
  p_human_move_log: RpcMoveLogPayload;
  p_bot_next_fen: string | null;
  p_bot_next_turn: string | null;
  p_bot_last_move_at: string | null;
  p_bot_move_deadline_at: string | null;
  p_bot_white_clock_ms: number | null;
  p_bot_black_clock_ms: number | null;
  p_bot_result: string | null;
  p_bot_end_reason: string | null;
  p_bot_move_log: RpcMoveLogPayload | null;
};

export function buildBotGameTurnRpcParams(input: {
  gameId: string;
  expectedFen: string;
  humanPatch: {
    fen: string;
    turn: string;
    last_move_at: string | null;
    move_deadline_at: string | null;
    white_clock_ms: number | null;
    black_clock_ms: number | null;
    promote_waiting_to_active: boolean;
  };
  humanTerminal: { result: string; endReason: string } | null;
  humanMoveLog: RpcMoveLogPayload;
  botPatch?: {
    fen: string;
    turn: string;
    last_move_at: string | null;
    move_deadline_at: string | null;
    white_clock_ms: number | null;
    black_clock_ms: number | null;
  } | null;
  botTerminal?: { result: string; endReason: string } | null;
  botMoveLog?: RpcMoveLogPayload | null;
}): BotGameTurnRpcParams {
  return {
    p_game_id: input.gameId,
    p_expected_fen: input.expectedFen,
    p_human_next_fen: input.humanPatch.fen,
    p_human_next_turn: input.humanPatch.turn,
    p_human_last_move_at: input.humanPatch.last_move_at,
    p_human_move_deadline_at: input.humanPatch.move_deadline_at,
    p_human_white_clock_ms: input.humanPatch.white_clock_ms,
    p_human_black_clock_ms: input.humanPatch.black_clock_ms,
    p_human_promote_waiting_to_active: input.humanPatch.promote_waiting_to_active,
    p_human_result: input.humanTerminal?.result ?? null,
    p_human_end_reason: input.humanTerminal?.endReason ?? null,
    p_human_move_log: input.humanMoveLog,
    p_bot_next_fen: input.botPatch?.fen ?? null,
    p_bot_next_turn: input.botPatch?.turn ?? null,
    p_bot_last_move_at: input.botPatch?.last_move_at ?? null,
    p_bot_move_deadline_at: input.botPatch?.move_deadline_at ?? null,
    p_bot_white_clock_ms: input.botPatch?.white_clock_ms ?? null,
    p_bot_black_clock_ms: input.botPatch?.black_clock_ms ?? null,
    p_bot_result: input.botTerminal?.result ?? null,
    p_bot_end_reason: input.botTerminal?.endReason ?? null,
    p_bot_move_log: input.botMoveLog ?? null,
  };
}
