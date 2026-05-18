/** Phase 1I-a — bot_move_jobs row contract (infra only; no worker cutover). */

export const BOT_MOVE_JOB_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export type BotMoveJobStatus = (typeof BOT_MOVE_JOB_STATUSES)[number];

export type BotMoveJobRow = {
  id: string;
  game_id: string;
  status: BotMoveJobStatus;
  post_human_fen: string;
  bot_player_id: string;
  idempotency_key: string;
  selected_uci: string | null;
  think_ms: number | null;
  attempt_count: number;
  last_error: string | null;
  correlation_id: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  completed_at: string | null;
};

export function isBotMoveJobStatus(raw: unknown): raw is BotMoveJobStatus {
  return typeof raw === 'string' && (BOT_MOVE_JOB_STATUSES as readonly string[]).includes(raw);
}
