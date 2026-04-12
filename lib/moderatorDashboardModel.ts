export const MODERATOR_QUEUE_PAGE_SIZE = 20;

export type QueueListFilters = {
  queueStatus: '' | 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  suspicionTier: '' | 'SOFT_LOCK_RECOMMENDED' | 'ESCALATE_REVIEW';
  recommendedAction:
    | ''
    | 'NO_ACTION'
    | 'MONITOR'
    | 'FLAG_ACCOUNT'
    | 'RESTRICT_ANALYSIS_ACCESS'
    | 'SEND_TO_MODERATOR_QUEUE';
  userId: string;
};

export type PaginationState = {
  total: number;
  limit: number;
  offset: number;
};

export function buildQueueQuery(filters: QueueListFilters, pagination: PaginationState): string {
  const params = new URLSearchParams();
  params.set('limit', String(pagination.limit));
  params.set('offset', String(pagination.offset));
  if (filters.queueStatus) params.set('queue_status', filters.queueStatus);
  if (filters.suspicionTier) params.set('suspicion_tier', filters.suspicionTier);
  if (filters.recommendedAction) params.set('recommended_action', filters.recommendedAction);
  if (filters.userId.trim()) params.set('user_id', filters.userId.trim());
  return params.toString();
}

export function canGoToPreviousPage(pagination: PaginationState): boolean {
  return pagination.offset > 0;
}

export function canGoToNextPage(pagination: PaginationState): boolean {
  return pagination.offset + pagination.limit < pagination.total;
}

export function isResolutionNoteRequired(action: 'MARK_IN_REVIEW' | 'MARK_RESOLVED' | 'MARK_DISMISSED'): boolean {
  return action === 'MARK_RESOLVED' || action === 'MARK_DISMISSED';
}
