import { SupabaseAntiCheatEnforcementStore } from '@/lib/analysis';
import { requireModerator } from '@/lib/moderatorAuth';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Params = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const guard = await requireModerator(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  const { userId } = await context.params;
  if (!userId) return json({ error: 'userId is required' }, 400);

  try {
    const supabase = createServiceRoleClient();
    const store = new SupabaseAntiCheatEnforcementStore(supabase);
    const effective = await store.getEffectiveState(userId);
    return json({
      user_id: effective.userId,
      baseline_state: effective.baselineState,
      effective_state: effective.state,
      source: effective.source,
      source_suspicion_tier: effective.sourceSuspicionTier,
      source_recommended_action: effective.sourceRecommendedAction,
      override_action: effective.overrideAction,
      override_reason: effective.overrideReason,
      override_expires_at: effective.overrideExpiresAt,
      created_at: effective.createdAt,
      updated_at: effective.updatedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Moderator enforcement state lookup failed';
    return json({ error: message }, 503);
  }
}
