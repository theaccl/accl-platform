import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { requireModerator } from '@/lib/moderatorAuth';
import { listMessagesForModerator } from '@/lib/chat/moderatorChatExport';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const mod = await requireModerator(request);
  if (!mod.ok) return json({ error: mod.error }, mod.status);

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get('limit') ?? '200');
  const limit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 200;
  const since = url.searchParams.get('since')?.trim() || null;

  const supabase = createServiceRoleClient();
  const messages = await listMessagesForModerator(supabase, { limit, since });
  return json({ messages });
}
