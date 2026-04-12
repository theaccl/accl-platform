import {
  SupabaseAntiCheatEnforcementStore,
  type ModeratorOverrideAction,
  type ModeratorOverrideInput,
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

type OverrideBody = {
  user_id?: unknown;
  action?: unknown;
  reason?: unknown;
  expires_at?: unknown;
};

function parseAction(value: unknown): ModeratorOverrideAction | null {
  const action = String(value ?? '').trim();
  if (action === 'CLEAR_RESTRICTION') return action;
  if (action === 'TEMPORARY_UNLOCK') return action;
  if (action === 'KEEP_LOCKED_PENDING_REVIEW') return action;
  return null;
}

function parseInput(body: OverrideBody, moderatorId: string): ModeratorOverrideInput | { error: string } {
  const userId = String(body.user_id ?? '').trim();
  if (!userId) return { error: 'user_id is required' };
  const action = parseAction(body.action);
  if (!action) {
    return {
      error: 'action must be CLEAR_RESTRICTION, TEMPORARY_UNLOCK, or KEEP_LOCKED_PENDING_REVIEW',
    };
  }
  const reason = body.reason == null ? null : String(body.reason).trim();
  if (!reason) return { error: 'reason is required' };
  const expiresAtRaw = body.expires_at == null ? null : String(body.expires_at).trim();
  if (action === 'TEMPORARY_UNLOCK' && !expiresAtRaw) {
    return { error: 'expires_at is required for TEMPORARY_UNLOCK' };
  }
  if (expiresAtRaw && Number.isNaN(Date.parse(expiresAtRaw))) {
    return { error: 'expires_at must be a valid ISO timestamp' };
  }
  return {
    userId,
    moderatorId,
    action,
    reason,
    expiresAt: expiresAtRaw,
  };
}

export async function POST(request: Request): Promise<Response> {
  const guard = await requireModerator(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  let body: OverrideBody;
  try {
    body = (await request.json()) as OverrideBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const parsed = parseInput(body, guard.userId);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  try {
    const supabase = createServiceRoleClient();
    const store = new SupabaseAntiCheatEnforcementStore(supabase);
    const result = await store.applyModeratorOverride(parsed);
    return json({
      user_id: result.userId,
      baseline_state: result.baselineState,
      effective_state: result.effectiveState,
      override_action: result.overrideAction,
      override_reason: result.overrideReason,
      override_expires_at: result.overrideExpiresAt,
      source: result.source,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Moderator enforcement override failed';
    return json({ error: message }, 503);
  }
}
