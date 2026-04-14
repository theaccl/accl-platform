import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { insertReport } from '@/lib/chat/chatRepository';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

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
  const rl = checkRateLimit(`chat:report:${userId}`, 40, 60_000);
  if (!rl.allowed) {
    return json(
      {
        error: 'rate_limited',
        retry_after_sec: rl.retryAfterSec,
        message: 'Too many reports. Wait before trying again.',
      },
      429,
    );
  }

  let body: { messageId?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as { messageId?: unknown; reason?: unknown };
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
  if (!messageId) return json({ error: 'messageId required' }, 400);
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;

  const supabase = createServiceRoleClient();
  const { data: msg } = await supabase.from('tester_chat_messages').select('id').eq('id', messageId).maybeSingle();
  if (!msg) return json({ error: 'message_not_found' }, 404);

  const ok = await insertReport(supabase, messageId, userId, reason);
  if (!ok) {
    auditApiLog('chat_message_report', { result: 'insert_failed', user: shortId(userId) });
    return json({ error: 'report_failed', message: 'Could not save report. Try again later.' }, 503);
  }
  return json({ ok: true });
}
