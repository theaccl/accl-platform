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
    const { data, error } = await supabase
      .from('anti_cheat_enforcement_override_history')
      .select('acted_by,action,reason,expires_at,created_at')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) {
      return json({ error: error.message }, 503);
    }
    return json({ items: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Moderator override history lookup failed';
    return json({ error: message }, 503);
  }
}
