import { supabase } from '@/lib/supabaseClient';

export type ModeratorQueueListItem = {
  id: string;
  user_id: string;
  game_id: string | null;
  anti_cheat_event_id: string | null;
  suspicion_tier: 'SOFT_LOCK_RECOMMENDED' | 'ESCALATE_REVIEW';
  suspicion_score: number;
  recommended_action:
    | 'NO_ACTION'
    | 'MONITOR'
    | 'FLAG_ACCOUNT'
    | 'RESTRICT_ANALYSIS_ACCESS'
    | 'SEND_TO_MODERATOR_QUEUE';
  overlap_verdict: string;
  queue_status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export type ModeratorQueueListResponse = {
  items: ModeratorQueueListItem[];
  pagination: { total: number; limit: number; offset: number };
};

export type ModeratorQueueDetailResponse = {
  queue: ModeratorQueueListItem & {
    moderator_note: string | null;
    resolution_note: string | null;
  };
  review_context: {
    suspicion_reasons: unknown;
    overlap_verdict: string;
    recommendation: string;
    linked_anti_cheat_events: Array<{
      id: string;
      created_at: string;
      overlap_verdict: string;
      suspicion_score: number;
      suspicion_tier: string;
      engine_called: boolean;
      protected_context: boolean;
    }>;
  };
  action_history: Array<{
    id: string;
    acted_by: string;
    action_type: string;
    previous_status: string;
    new_status: string;
    moderator_note: string | null;
    resolution_note: string | null;
    created_at: string;
  }>;
};

export type ModeratorEnforcementStateResponse = {
  user_id: string;
  baseline_state: string;
  effective_state: string;
  source: 'baseline' | 'override';
  source_suspicion_tier: string | null;
  source_recommended_action: string | null;
  override_action: string | null;
  override_reason: string | null;
  override_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ModeratorEnforcementOverrideHistoryRow = {
  acted_by: string;
  action: string;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
};

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export async function fetchModeratorQueueList(query: string): Promise<ModeratorQueueListResponse> {
  const response = await fetch(`/api/moderator/queue?${query}`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  const payload = await parseJson<ModeratorQueueListResponse & { error?: string }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? 'Moderator queue list request failed');
  }
  return payload;
}

export async function fetchModeratorQueueDetail(queueId: string): Promise<ModeratorQueueDetailResponse> {
  const response = await fetch(`/api/moderator/queue/${encodeURIComponent(queueId)}`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  const payload = await parseJson<ModeratorQueueDetailResponse & { error?: string }>(response);
  if (!response.ok) throw new Error(payload.error ?? 'Moderator queue detail request failed');
  return payload;
}

export async function applyModeratorQueueAction(input: {
  queueId: string;
  action: 'MARK_IN_REVIEW' | 'MARK_RESOLVED' | 'MARK_DISMISSED';
  note?: string;
  resolution_note?: string;
}): Promise<{
  ok: boolean;
  queue: {
    id: string;
    queue_status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
    assigned_to: string | null;
    moderator_note: string | null;
    resolution_note: string | null;
    updated_at: string;
  };
}> {
  const response = await fetch(`/api/moderator/queue/${encodeURIComponent(input.queueId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify({
      action: input.action,
      note: input.note ?? null,
      resolution_note: input.resolution_note ?? null,
    }),
  });
  const payload = await parseJson<{ ok?: boolean; queue?: never; error?: string } & { queue: never }>(response);
  if (!response.ok) throw new Error(payload.error ?? 'Moderator action failed');
  return payload as never;
}

export async function fetchModeratorEnforcementState(userId: string): Promise<ModeratorEnforcementStateResponse> {
  const response = await fetch(`/api/moderator/enforcement/${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  const payload = await parseJson<ModeratorEnforcementStateResponse & { error?: string }>(response);
  if (!response.ok) throw new Error(payload.error ?? 'Moderator enforcement state request failed');
  return payload;
}

export async function fetchModeratorEnforcementOverrideHistory(
  userId: string
): Promise<{ items: ModeratorEnforcementOverrideHistoryRow[] }> {
  const response = await fetch(`/api/moderator/enforcement/${encodeURIComponent(userId)}/history`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  const payload = await parseJson<{ items?: ModeratorEnforcementOverrideHistoryRow[]; error?: string }>(response);
  if (!response.ok) throw new Error(payload.error ?? 'Moderator enforcement override history request failed');
  return { items: Array.isArray(payload.items) ? payload.items : [] };
}

export async function applyModeratorEnforcementOverride(input: {
  user_id: string;
  action: 'CLEAR_RESTRICTION' | 'TEMPORARY_UNLOCK' | 'KEEP_LOCKED_PENDING_REVIEW';
  reason: string;
  expires_at?: string | null;
}): Promise<{
  user_id: string;
  baseline_state: string;
  effective_state: string;
  override_action: string | null;
  override_reason: string | null;
  override_expires_at: string | null;
  source: 'baseline' | 'override';
}> {
  const response = await fetch('/api/moderator/enforcement/override', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify({
      user_id: input.user_id,
      action: input.action,
      reason: input.reason,
      expires_at: input.expires_at ?? null,
    }),
  });
  const payload = await parseJson<
    {
      user_id: string;
      baseline_state: string;
      effective_state: string;
      override_action: string | null;
      override_reason: string | null;
      override_expires_at: string | null;
      source: 'baseline' | 'override';
      error?: string;
    }
  >(response);
  if (!response.ok) throw new Error(payload.error ?? 'Moderator enforcement override failed');
  return payload;
}
