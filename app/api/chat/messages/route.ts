import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { handleChatMessagesGet } from '@/lib/chat/handleChatMessages';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return handleChatMessagesGet(request, userId);
}
