import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { upsertBlock } from '@/lib/chat/chatRepository';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);
  const rl = checkRateLimit(`chat:block:${userId}`, 40, 60_000);
  if (!rl.allowed) {
    return json(
      {
        error: 'rate_limited',
        retry_after_sec: rl.retryAfterSec,
        message: 'Too many block changes. Wait a moment.',
      },
      429,
    );
  }

  let body: { userId?: unknown };
  try {
    body = (await request.json()) as { userId?: unknown };
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const blockedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!blockedUserId || blockedUserId === userId) return json({ error: 'invalid_user' }, 400);

  const supabase = createServiceRoleClient();
  const { data: prof } = await supabase.from('profiles').select('id').eq('id', blockedUserId).maybeSingle();
  if (!prof) return json({ error: 'user_not_found' }, 404);

  const ok = await upsertBlock(supabase, userId, blockedUserId);
  if (!ok) return json({ error: 'block_failed' }, 503);
  return json({ ok: true });
}
