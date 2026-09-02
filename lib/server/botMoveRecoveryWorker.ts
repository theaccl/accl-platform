import { Chess } from 'chess.js';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { BotMoveJobRow } from '@/lib/bot/botMoveJobTypes';
import { commitBotGameTurn, type SubmitMoveBotGameResult } from '@/lib/server/submitMoveBotGameCommit';

const RECOVERY_GAME_SELECT =
  'id,fen,turn,status,tempo,live_time_control,last_move_at,move_deadline_at,white_clock_ms,black_clock_ms,white_player_id,black_player_id,source_type,bot_settings,rating_last_update';
const RECOVERY_LOG_SELECT =
  'game_id,player_id,san,from_sq,to_sq,fen_before,fen_after,move_duration_ms,idempotency_key';
const MAX_RECOVERY_ATTEMPTS = 5;

type RecoveryMoveLog = {
  game_id: string;
  player_id: string;
  san: string;
  from_sq: string;
  to_sq: string;
  fen_before: string | null;
  fen_after: string;
  move_duration_ms: number | null;
  idempotency_key: string | null;
};

export type BotMoveRecoveryResult = {
  recoveredStale: number;
  claimed: boolean;
  jobId?: string;
  gameId?: string;
  outcome?: 'completed' | 'cancelled' | 'failed' | 'requeued';
  error?: string;
};

export function parseClaimedBotMoveJob(raw: unknown): BotMoveJobRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const job = raw as Record<string, unknown>;
  if (!String(job.id ?? '').trim() || !String(job.game_id ?? '').trim()) return null;
  return job as unknown as BotMoveJobRow;
}

async function releaseJob(
  supabase: SupabaseClient,
  jobId: string,
  message: string,
): Promise<string | null> {
  const { error } = await supabase.rpc('release_bot_move_job', {
    p_job_id: jobId,
    p_error: message.slice(0, 500),
  });
  return error?.message ?? null;
}

async function retryOrFailJob(
  supabase: SupabaseClient,
  job: BotMoveJobRow,
  message: string,
): Promise<{ outcome?: 'failed' | 'requeued'; error: string }> {
  const releaseError = await releaseJob(supabase, job.id, message);
  if (releaseError) return { error: releaseError };
  return {
    outcome: Number(job.attempt_count ?? 0) >= MAX_RECOVERY_ATTEMPTS ? 'failed' : 'requeued',
    error: message,
  };
}

async function cancelJob(
  supabase: SupabaseClient,
  jobId: string,
  reason: string,
): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_bot_move_job', {
    p_job_id: jobId,
    p_reason: reason,
  });
  return error?.message ?? null;
}

export async function processNextBotMoveRecoveryJob(
  supabase: SupabaseClient,
  options?: {
    commit?: typeof commitBotGameTurn;
    staleAfterSeconds?: number;
  },
): Promise<BotMoveRecoveryResult> {
  const staleAfterSeconds = Math.max(30, options?.staleAfterSeconds ?? 120);
  const { data: recoveredRaw, error: recoveryError } = await supabase.rpc(
    'recover_stale_bot_move_jobs',
    { p_stale_after_seconds: staleAfterSeconds, p_limit: 25 },
  );
  if (recoveryError) {
    return { recoveredStale: 0, claimed: false, error: recoveryError.message };
  }
  const recoveredStale = Number.isFinite(recoveredRaw) ? Math.max(0, Number(recoveredRaw)) : 0;

  const { data: claimedRaw, error: claimError } = await supabase.rpc('claim_next_bot_move_job');
  if (claimError) {
    return { recoveredStale, claimed: false, error: claimError.message };
  }
  const job = parseClaimedBotMoveJob(claimedRaw);
  if (!job) return { recoveredStale, claimed: false };

  const base = {
    recoveredStale,
    claimed: true,
    jobId: job.id,
    gameId: job.game_id,
  } as const;

  const gameQuery = await supabase
    .from('games')
    .select(RECOVERY_GAME_SELECT)
    .eq('id', job.game_id)
    .maybeSingle();
  if (gameQuery.error || !gameQuery.data) {
    const error = gameQuery.error?.message ?? 'recovery_game_not_found';
    if (!gameQuery.data && !gameQuery.error) {
      const cancellationError = await cancelJob(supabase, job.id, error);
      if (cancellationError) return { ...base, error: cancellationError };
      return { ...base, outcome: 'cancelled', error };
    }
    const transition = await retryOrFailJob(supabase, job, error);
    return { ...base, ...transition };
  }
  const game = gameQuery.data as Record<string, unknown>;
  if (
    String(game.status ?? '').trim().toLowerCase() !== 'active' ||
    String(game.fen ?? '').trim() !== String(job.post_human_fen ?? '').trim()
  ) {
    const cancellationError = await cancelJob(supabase, job.id, 'game_no_longer_at_reserved_bot_turn');
    if (cancellationError) return { ...base, error: cancellationError };
    return { ...base, outcome: 'cancelled' };
  }

  const logQuery = await supabase
    .from('game_move_logs')
    .select(RECOVERY_LOG_SELECT)
    .eq('game_id', job.game_id)
    .eq('idempotency_key', job.idempotency_key)
    .maybeSingle();
  if (logQuery.error || !logQuery.data) {
    const error = logQuery.error?.message ?? 'recovery_human_log_not_found';
    if (!logQuery.data && !logQuery.error) {
      const cancellationError = await cancelJob(supabase, job.id, error);
      if (cancellationError) return { ...base, error: cancellationError };
      return { ...base, outcome: 'cancelled', error };
    }
    const transition = await retryOrFailJob(supabase, job, error);
    return { ...base, ...transition };
  }
  const log = logQuery.data as RecoveryMoveLog;

  let board: Chess;
  try {
    board = new Chess(job.post_human_fen);
  } catch {
    const cancellationError = await cancelJob(supabase, job.id, 'invalid_reserved_fen');
    if (cancellationError) return { ...base, error: cancellationError };
    return { ...base, outcome: 'cancelled', error: 'invalid_reserved_fen' };
  }

  let result: SubmitMoveBotGameResult;
  try {
    const commit = options?.commit ?? commitBotGameTurn;
    result = await commit(
      {
        gameId: job.game_id,
        userId: log.player_id,
        preMoveFen: String(log.fen_before ?? ''),
        nextFen: log.fen_after,
        fromSquare: log.from_sq,
        toSquare: log.to_sq,
        moveDurationMs: Math.max(0, Number(log.move_duration_ms ?? 0)),
        humanIdempotencyKey: job.idempotency_key,
        humanSan: log.san,
        initialGameRow: game,
        gameRow: game,
        humanAlreadyCommitted: true,
        movePatch: null,
        terminal: null,
        board,
      },
      { supabase },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const transition = await retryOrFailJob(supabase, job, message);
    return { ...base, ...transition };
  }

  if (!result.ok) {
    if (result.kind !== 'commit_failed') {
      const cancellationError = await cancelJob(
        supabase,
        job.id,
        `permanent_${result.kind}:${result.message}`,
      );
      if (cancellationError) return { ...base, error: cancellationError };
      return { ...base, outcome: 'cancelled', error: result.message };
    }
    const transition = await retryOrFailJob(supabase, job, result.message);
    return { ...base, ...transition };
  }

  return { ...base, outcome: 'completed' };
}
