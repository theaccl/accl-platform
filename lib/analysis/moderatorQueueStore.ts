import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  OverlapVerdict,
  RecommendedAction,
  SuspicionReason,
  SuspicionTier,
} from '@/lib/analysis/intelligence';
import type { ModeratorQueuePayload, ModeratorQueueSink } from '@/lib/analysis/moderatorQueue';

export type QueueStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';

export type ModeratorQueueRecord = {
  id: string;
  user_id: string;
  game_id: string | null;
  anti_cheat_event_id: string | null;
  suspicion_tier: Extract<SuspicionTier, 'SOFT_LOCK_RECOMMENDED' | 'ESCALATE_REVIEW'>;
  suspicion_score: number;
  recommended_action: RecommendedAction;
  supporting_reasons_json: SuspicionReason[];
  overlap_verdict: OverlapVerdict;
  queue_status: QueueStatus;
  assigned_to: string | null;
  moderator_note: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ModeratorQueueListFilters = {
  queue_status?: QueueStatus;
  suspicion_tier?: ModeratorQueueRecord['suspicion_tier'];
  recommended_action?: RecommendedAction;
  user_id?: string;
  limit: number;
  offset: number;
};

export type ModeratorQueueAction =
  | { type: 'MARK_IN_REVIEW'; moderatorId: string; note?: string | null }
  | { type: 'MARK_RESOLVED'; moderatorId: string; resolutionNote?: string | null }
  | { type: 'MARK_DISMISSED'; moderatorId: string; resolutionNote?: string | null };

export type ModeratorQueueActionHistoryRecord = {
  id: string;
  queue_id: string;
  acted_by: string;
  action_type: ModeratorQueueAction['type'];
  previous_status: QueueStatus;
  new_status: QueueStatus;
  moderator_note: string | null;
  resolution_note: string | null;
  created_at: string;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function nextQueueStatusForAction(actionType: ModeratorQueueAction['type']): QueueStatus {
  if (actionType === 'MARK_IN_REVIEW') return 'IN_REVIEW';
  if (actionType === 'MARK_RESOLVED') return 'RESOLVED';
  return 'DISMISSED';
}

export class SupabaseModeratorQueueStore implements ModeratorQueueSink {
  constructor(private readonly supabase: SupabaseClient) {}

  private async resolveLinkedAntiCheatEventId(input: {
    userId: string;
    gameId: string | null;
  }): Promise<string | null> {
    let query = this.supabase
      .from('anti_cheat_events')
      .select('id')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (input.gameId) query = query.eq('game_id', input.gameId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const id = Array.isArray(data) && data[0] ? String((data[0] as { id?: unknown }).id ?? '') : '';
    return id || null;
  }

  async enqueue(payload: ModeratorQueuePayload): Promise<void> {
    const antiCheatEventId = await this.resolveLinkedAntiCheatEventId({
      userId: payload.user_id,
      gameId: payload.game_id,
    });
    const { error } = await this.supabase.from('moderator_queue').insert({
      user_id: payload.user_id,
      game_id: payload.game_id,
      anti_cheat_event_id: antiCheatEventId,
      suspicion_tier: payload.suspicion_tier,
      suspicion_score: payload.suspicion_score,
      recommended_action: payload.recommended_action,
      supporting_reasons_json: payload.supporting_reasons,
      overlap_verdict: payload.overlap_verdict,
      queue_status: 'OPEN',
    });
    if (error) throw new Error(error.message);
  }

  async list(
    filters: ModeratorQueueListFilters
  ): Promise<{ rows: ModeratorQueueRecord[]; total: number; limit: number; offset: number }> {
    const limit = clamp(filters.limit, 1, 100);
    const offset = Math.max(0, filters.offset);
    const rangeTo = offset + limit - 1;
    let query = this.supabase
      .from('moderator_queue')
      .select(
        'id,user_id,game_id,anti_cheat_event_id,suspicion_tier,suspicion_score,recommended_action,supporting_reasons_json,overlap_verdict,queue_status,assigned_to,moderator_note,resolution_note,created_at,updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, rangeTo);

    if (filters.queue_status) query = query.eq('queue_status', filters.queue_status);
    if (filters.suspicion_tier) query = query.eq('suspicion_tier', filters.suspicion_tier);
    if (filters.recommended_action) query = query.eq('recommended_action', filters.recommended_action);
    if (filters.user_id) query = query.eq('user_id', filters.user_id);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return {
      rows: (data ?? []) as ModeratorQueueRecord[],
      total: count ?? 0,
      limit,
      offset,
    };
  }

  async getById(id: string): Promise<ModeratorQueueRecord | null> {
    const { data, error } = await this.supabase
      .from('moderator_queue')
      .select(
        'id,user_id,game_id,anti_cheat_event_id,suspicion_tier,suspicion_score,recommended_action,supporting_reasons_json,overlap_verdict,queue_status,assigned_to,moderator_note,resolution_note,created_at,updated_at'
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as ModeratorQueueRecord | null;
  }

  async applyAction(queueId: string, action: ModeratorQueueAction): Promise<ModeratorQueueRecord | null> {
    const moderatorNote = action.type === 'MARK_IN_REVIEW' ? (action.note ?? null) : null;
    const resolutionNote =
      action.type === 'MARK_RESOLVED' || action.type === 'MARK_DISMISSED' ? (action.resolutionNote ?? null) : null;

    const { data, error } = await this.supabase.rpc('apply_moderator_queue_action_atomic', {
      p_queue_id: queueId,
      p_acted_by: action.moderatorId,
      p_action_type: action.type,
      p_moderator_note: moderatorNote,
      p_resolution_note: resolutionNote,
    });
    if (error) {
      const missingAtomicFunction = error.message.includes('apply_moderator_queue_action_atomic');
      if (!missingAtomicFunction) throw new Error(error.message);

      const existing = await this.getById(queueId);
      if (!existing) return null;

      const nextStatus = nextQueueStatusForAction(action.type);
      const nextModeratorNote = action.type === 'MARK_IN_REVIEW' ? moderatorNote : existing.moderator_note;
      const nextResolutionNote =
        action.type === 'MARK_RESOLVED' || action.type === 'MARK_DISMISSED' ? resolutionNote : existing.resolution_note;

      const { data: updated, error: updateError } = await this.supabase
        .from('moderator_queue')
        .update({
          queue_status: nextStatus,
          assigned_to: action.moderatorId,
          moderator_note: nextModeratorNote,
          resolution_note: nextResolutionNote,
        })
        .eq('id', queueId)
        .select(
          'id,user_id,game_id,anti_cheat_event_id,suspicion_tier,suspicion_score,recommended_action,supporting_reasons_json,overlap_verdict,queue_status,assigned_to,moderator_note,resolution_note,created_at,updated_at'
        )
        .maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!updated) return null;

      const { error: historyError } = await this.supabase.from('moderator_queue_action_history').insert({
        queue_id: updated.id,
        acted_by: action.moderatorId,
        action_type: action.type,
        previous_status: existing.queue_status,
        new_status: nextStatus,
        moderator_note: nextModeratorNote,
        resolution_note: nextResolutionNote,
      });
      if (historyError) throw new Error(historyError.message);

      return updated as ModeratorQueueRecord;
    }
    if (!data) return null;
    return data as ModeratorQueueRecord;
  }

  async listActionHistory(queueId: string, limit = 100): Promise<ModeratorQueueActionHistoryRecord[]> {
    const { data, error } = await this.supabase
      .from('moderator_queue_action_history')
      .select(
        'id,queue_id,acted_by,action_type,previous_status,new_status,moderator_note,resolution_note,created_at'
      )
      .eq('queue_id', queueId)
      .order('created_at', { ascending: true })
      .limit(clamp(limit, 1, 500));
    if (error) throw new Error(error.message);
    return (data ?? []) as ModeratorQueueActionHistoryRecord[];
  }

  async listLinkedEventsSummary(input: { userId: string; gameId: string | null; limit?: number }) {
    let query = this.supabase
      .from('anti_cheat_events')
      .select('id,created_at,overlap_verdict,suspicion_score,suspicion_tier,engine_called,protected_context')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(clamp(input.limit ?? 20, 1, 100));
    if (input.gameId) query = query.eq('game_id', input.gameId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      created_at: string;
      overlap_verdict: string;
      suspicion_score: number;
      suspicion_tier: string;
      engine_called: boolean;
      protected_context: boolean;
    }>;
  }
}
