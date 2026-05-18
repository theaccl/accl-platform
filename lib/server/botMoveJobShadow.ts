import type { SupabaseClient } from '@supabase/supabase-js';

import { isBotMoveQueueShadowEnabled } from '@/lib/bot/botMoveQueueFeature';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

export type BotMoveShadowRecordInput = {
  gameId: string;
  postHumanFen: string;
  botPlayerId: string;
  idempotencyKey: string;
  selectedUci: string;
  thinkMs: number | null;
  correlationId?: string | null;
};

export type BotMoveShadowRecordResult =
  | { ok: true; skipped: true }
  | { ok: true; jobId: string }
  | { ok: false; error: string };

/**
 * Non-authoritative audit row after sync composite commit succeeded.
 * Never throws — failures are logged only.
 */
export async function recordShadowBotMoveJob(
  supabase: SupabaseClient,
  input: BotMoveShadowRecordInput,
): Promise<BotMoveShadowRecordResult> {
  if (!isBotMoveQueueShadowEnabled()) {
    return { ok: true, skipped: true };
  }

  try {
    const { data: jobId, error } = await supabase.rpc('record_bot_move_job_shadow_system', {
      p_game_id: input.gameId,
      p_post_human_fen: input.postHumanFen,
      p_bot_player_id: input.botPlayerId,
      p_idempotency_key: input.idempotencyKey,
      p_selected_uci: input.selectedUci,
      p_think_ms: input.thinkMs,
      p_correlation_id: input.correlationId ?? null,
    });

    if (error || !jobId) {
      const message = String(error?.message ?? 'shadow_record_failed');
      auditApiLog('bot_move_shadow_failed', {
        game_id: shortId(input.gameId),
        error: message.slice(0, 200),
      });
      return { ok: false, error: message };
    }

    auditApiLog('bot_move_shadow_ok', {
      game_id: shortId(input.gameId),
      job_id: shortId(String(jobId)),
    });
    return { ok: true, jobId: String(jobId) };
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    auditApiLog('bot_move_shadow_failed', {
      game_id: shortId(input.gameId),
      error: message.slice(0, 200),
    });
    return { ok: false, error: message };
  }
}
