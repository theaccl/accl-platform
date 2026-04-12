import {
  SupabaseModeratorQueueStore,
  type QueueStatus,
  type RecommendedAction,
} from '@/lib/analysis';
import { requireModerator } from '@/lib/moderatorAuth';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function maybeQueueStatus(value: string | null): QueueStatus | undefined {
  if (!value) return undefined;
  if (value === 'OPEN' || value === 'IN_REVIEW' || value === 'RESOLVED' || value === 'DISMISSED') {
    return value;
  }
  return undefined;
}

function maybeSuspicionTier(
  value: string | null
): 'SOFT_LOCK_RECOMMENDED' | 'ESCALATE_REVIEW' | undefined {
  if (!value) return undefined;
  if (value === 'SOFT_LOCK_RECOMMENDED' || value === 'ESCALATE_REVIEW') return value;
  return undefined;
}

function maybeRecommendedAction(value: string | null): RecommendedAction | undefined {
  if (!value) return undefined;
  if (
    value === 'NO_ACTION' ||
    value === 'MONITOR' ||
    value === 'FLAG_ACCOUNT' ||
    value === 'RESTRICT_ANALYSIS_ACCESS' ||
    value === 'SEND_TO_MODERATOR_QUEUE'
  ) {
    return value;
  }
  return undefined;
}

export async function GET(request: Request): Promise<Response> {
  const guard = await requireModerator(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  try {
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);
    const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
    const queue_status = maybeQueueStatus(url.searchParams.get('queue_status'));
    const suspicion_tier = maybeSuspicionTier(url.searchParams.get('suspicion_tier'));
    const recommended_action = maybeRecommendedAction(url.searchParams.get('recommended_action'));
    const user_id = (url.searchParams.get('user_id') ?? '').trim() || undefined;

    if (url.searchParams.get('queue_status') && !queue_status) {
      return json({ error: 'Invalid queue_status' }, 400);
    }
    if (url.searchParams.get('suspicion_tier') && !suspicion_tier) {
      return json({ error: 'Invalid suspicion_tier' }, 400);
    }
    if (url.searchParams.get('recommended_action') && !recommended_action) {
      return json({ error: 'Invalid recommended_action' }, 400);
    }

    const supabase = createServiceRoleClient();
    const store = new SupabaseModeratorQueueStore(supabase);
    const result = await store.list({
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
      queue_status,
      suspicion_tier,
      recommended_action,
      user_id,
    });
    return json({
      items: result.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        game_id: row.game_id,
        anti_cheat_event_id: row.anti_cheat_event_id,
        suspicion_tier: row.suspicion_tier,
        suspicion_score: row.suspicion_score,
        recommended_action: row.recommended_action,
        overlap_verdict: row.overlap_verdict,
        queue_status: row.queue_status,
        assigned_to: row.assigned_to,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Moderator queue lookup failed';
    return json({ error: message }, 503);
  }
}
