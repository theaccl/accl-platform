import { SupabaseModeratorQueueStore, type ModeratorQueueAction } from '@/lib/analysis';
import { requireModerator } from '@/lib/moderatorAuth';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const guard = await requireModerator(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  const { id } = await context.params;
  if (!id) return json({ error: 'queue id is required' }, 400);

  try {
    const supabase = createServiceRoleClient();
    const store = new SupabaseModeratorQueueStore(supabase);
    const queue = await store.getById(id);
    if (!queue) return json({ error: 'Queue item not found' }, 404);
    const actionHistory = await store.listActionHistory(id, 200);
    const linkedEvents = await store.listLinkedEventsSummary({
      userId: queue.user_id,
      gameId: queue.game_id,
      limit: 20,
    });
    return json({
      queue: {
        id: queue.id,
        user_id: queue.user_id,
        game_id: queue.game_id,
        anti_cheat_event_id: queue.anti_cheat_event_id,
        suspicion_tier: queue.suspicion_tier,
        suspicion_score: queue.suspicion_score,
        recommended_action: queue.recommended_action,
        overlap_verdict: queue.overlap_verdict,
        queue_status: queue.queue_status,
        assigned_to: queue.assigned_to,
        moderator_note: queue.moderator_note,
        resolution_note: queue.resolution_note,
        created_at: queue.created_at,
        updated_at: queue.updated_at,
      },
      review_context: {
        suspicion_reasons: queue.supporting_reasons_json,
        overlap_verdict: queue.overlap_verdict,
        recommendation: queue.recommended_action,
        linked_anti_cheat_events: linkedEvents,
      },
      action_history: actionHistory,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Moderator queue detail lookup failed';
    return json({ error: message }, 503);
  }
}

type ActionBody = {
  action?: unknown;
  note?: unknown;
  resolution_note?: unknown;
};

function parseAction(body: ActionBody, moderatorId: string): ModeratorQueueAction | null {
  const action = String(body.action ?? '').trim();
  const note = body.note == null ? null : String(body.note);
  const resolutionNote = body.resolution_note == null ? null : String(body.resolution_note);
  if (action === 'MARK_IN_REVIEW') {
    return { type: 'MARK_IN_REVIEW', moderatorId, note };
  }
  if (action === 'MARK_RESOLVED') {
    return { type: 'MARK_RESOLVED', moderatorId, resolutionNote };
  }
  if (action === 'MARK_DISMISSED') {
    return { type: 'MARK_DISMISSED', moderatorId, resolutionNote };
  }
  return null;
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const guard = await requireModerator(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const { id } = await context.params;
  if (!id) return json({ error: 'queue id is required' }, 400);

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const action = parseAction(body, guard.userId);
  if (!action) {
    return json({ error: 'action must be MARK_IN_REVIEW, MARK_RESOLVED, or MARK_DISMISSED' }, 400);
  }

  try {
    const supabase = createServiceRoleClient();
    const store = new SupabaseModeratorQueueStore(supabase);
    const updated = await store.applyAction(id, action);
    if (!updated) return json({ error: 'Queue item not found' }, 404);
    return json({
      ok: true,
      queue: {
        id: updated.id,
        queue_status: updated.queue_status,
        assigned_to: updated.assigned_to,
        moderator_note: updated.moderator_note,
        resolution_note: updated.resolution_note,
        updated_at: updated.updated_at,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Moderator queue update failed';
    return json({ error: message }, 503);
  }
}
