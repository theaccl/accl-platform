import type { SuspicionReason, SuspicionTier, RecommendedAction, OverlapVerdict } from './intelligence';

export type ModeratorQueuePayload = {
  user_id: string;
  game_id: string | null;
  suspicion_tier: Extract<SuspicionTier, 'SOFT_LOCK_RECOMMENDED' | 'ESCALATE_REVIEW'>;
  suspicion_score: number;
  recommended_action: RecommendedAction;
  supporting_reasons: SuspicionReason[];
  overlap_verdict: OverlapVerdict;
  created_at: string;
};

export interface ModeratorQueueSink {
  enqueue(payload: ModeratorQueuePayload): Promise<void>;
}

export class InMemoryModeratorQueueSink implements ModeratorQueueSink {
  private rows: ModeratorQueuePayload[] = [];

  async enqueue(payload: ModeratorQueuePayload): Promise<void> {
    this.rows.push(payload);
  }

  snapshot(): ModeratorQueuePayload[] {
    return [...this.rows];
  }
}
