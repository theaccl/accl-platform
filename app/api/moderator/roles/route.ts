import { requireModeratorAdmin } from '@/lib/moderatorAuth';
import { SupabaseModeratorRoleAdminStore } from '@/lib/moderatorRoleAdminStore';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type RoleActionBody = {
  action?: unknown;
  target_user_id?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const guard = await requireModeratorAdmin(request);
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  let body: RoleActionBody;
  try {
    body = (await request.json()) as RoleActionBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const action = String(body.action ?? '').trim();
  const targetUserId = String(body.target_user_id ?? '').trim();
  if (!targetUserId) return json({ error: 'target_user_id is required' }, 400);
  if (targetUserId === guard.userId) return json({ error: 'self role mutation is not allowed' }, 400);

  try {
    const supabase = createServiceRoleClient();
    const store = new SupabaseModeratorRoleAdminStore(supabase);
    const result =
      action === 'GRANT_MODERATOR'
        ? await store.grantModeratorRole(guard.userId, targetUserId)
        : action === 'REVOKE_MODERATOR'
          ? await store.revokeModeratorRole(guard.userId, targetUserId)
          : null;
    if (!result) {
      return json({ error: 'action must be GRANT_MODERATOR or REVOKE_MODERATOR' }, 400);
    }
    return json({ ok: true, audit: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Moderator role admin mutation failed';
    return json({ error: message }, 503);
  }
}
