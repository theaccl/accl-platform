import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { getOrCreateDmThread, isDmBlocked, listDmThreadsForUser } from '@/lib/chat/chatRepository';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);
  const rl = checkRateLimit(`dm:thread:list:${userId}`, 120, 60_000);
  if (!rl.allowed) {
    return json(
      {
        error: 'rate_limited',
        retry_after_sec: rl.retryAfterSec,
        message: 'Too many requests. Wait a moment.',
      },
      429,
    );
  }
  const supabase = createServiceRoleClient();
  const threads = await listDmThreadsForUser(supabase, userId);
  return json({ threads });
}

/** Open or create a DM thread with a peer (no message sent). */
export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);
  const rl = checkRateLimit(`dm:thread:create:${userId}`, 30, 60_000);
  if (!rl.allowed) {
    return json(
      {
        error: 'rate_limited',
        retry_after_sec: rl.retryAfterSec,
        message: 'Too many DM actions. Wait a moment.',
      },
      429,
    );
  }
  let body: { peerId?: unknown };
  try {
    body = (await request.json()) as { peerId?: unknown };
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const peerId = typeof body.peerId === 'string' ? body.peerId.trim() : '';
  if (!peerId || peerId === userId) return json({ error: 'invalid_peer' }, 400);
  const supabase = createServiceRoleClient();
  const { data: prof } = await supabase.from('profiles').select('id').eq('id', peerId).maybeSingle();
  if (!prof) return json({ error: 'peer_not_found' }, 404);
  if (await isDmBlocked(supabase, userId, peerId)) return json({ error: 'blocked' }, 403);
  const thread = await getOrCreateDmThread(supabase, userId, peerId);
  if (!thread) return json({ error: 'thread_failed' }, 503);
  return json({ thread_id: thread.id });
}
