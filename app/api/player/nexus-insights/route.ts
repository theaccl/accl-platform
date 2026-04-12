import { createClient } from '@supabase/supabase-js';

import { sanitizePlayerInsights } from '@/lib/nexus/playerInsights';
import { NexusOutputRegistryService, SupabaseNexusOutputRegistryRepo } from '@/lib/nexus/outputRegistry';

export const runtime = 'nodejs';

const nativeFetch = globalThis.fetch.bind(globalThis);
const stableFetch: typeof fetch = (...args) => nativeFetch(...args);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function resolveAuthenticatedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const token = m[1]?.trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: stableFetch },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user?.id ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  try {
    const service = new NexusOutputRegistryService(new SupabaseNexusOutputRegistryRepo());
    const rows = await service.query({
      subject_scope: 'player',
      subject_id: userId,
      active_only: true,
      limit: 50,
    });

    const items = sanitizePlayerInsights({
      rows,
      current_user_id: userId,
      limit: 20,
    });

    return json({
      filters: {
        subject_scope: 'player',
        subject_id: userId,
        status: 'active',
        allowed_output_types: ['insight', 'recommendation', 'warning'],
      },
      total: items.length,
      items,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Failed to read player insights' }, 503);
  }
}

