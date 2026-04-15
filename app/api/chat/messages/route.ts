import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { handleChatMessagesGet } from '@/lib/chat/handleChatMessages';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const userId = await resolveAuthenticatedUserId(request);
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return handleChatMessagesGet(request, userId);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'chat_messages_internal_error';
    console.error('[api/chat/messages]', message);
    return new Response(JSON.stringify({ error: 'internal_error', message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
