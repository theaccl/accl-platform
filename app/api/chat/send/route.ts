import { resolveAuthenticatedUserId } from '@/lib/requestAuth';
import { handleChatSend } from '@/lib/chat/handleChatSend';
import { viewerEcosystemFromRequest } from '@/lib/chat/viewerEcosystemHeader';
import { auditApiLog, shortId } from '@/lib/server/prodLog';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  console.error('[api/chat/send] env presence', {
    has_SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
    has_NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
    has_E2E_SUPABASE_URL: Boolean(process.env.E2E_SUPABASE_URL?.trim()),
    has_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    has_E2E_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim()),
  });
  try {
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
  } catch (e) {
    const message = e instanceof Error ? e.message : 'chat_send_internal_error';
    console.error('[api/chat/send]', message);
    return new Response(JSON.stringify({ error: 'internal_error', message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
