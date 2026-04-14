import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { handleChatSend } from '@/lib/chat/handleChatSend';
import { viewerEcosystemFromRequest } from '@/lib/chat/viewerEcosystemHeader';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const viewerEcosystem = viewerEcosystemFromRequest(request);
  const res = await handleChatSend(request, userId, viewerEcosystem);
  if (res.ok) {
    auditApiLog('tester_chat_send', { user: shortId(userId) });
  }
  return res;
}
