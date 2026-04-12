import { createClient } from '@supabase/supabase-js';
import { getNexusData, type NexusEcosystem } from '@/lib/nexus/getNexusData';
import { auditApiLog, logSlowRequest, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';

export const runtime = 'nodejs';

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
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
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user?.id ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'nexus_overview');
  if (!guard.ok) return guard.response;

  try {
  const url = new URL(request.url);
  const ecoRaw = (url.searchParams.get('ecosystem') ?? 'adult').toLowerCase();
  const ecosystem: NexusEcosystem = ecoRaw === 'k12' ? 'k12' : 'adult';
  const userId = await resolveAuthenticatedUserId(request);
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const data = await getNexusData({ ecosystem, currentUserId: userId });
  const ms = typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
  logSlowRequest('nexus_overview', ms, { ecosystem });
  auditApiLog('nexus_overview', {
    ecosystem,
    auth: userId ? 'session' : 'anon',
    user: userId ? shortId(userId) : null,
    ms,
  });
  if (process.env.NODE_ENV === 'development' && typeof performance !== 'undefined') {
    console.info(`[nexus/overview] getNexusData ${ms}ms`);
  }
  // Personalized payload — private, short TTL; SWR allows stale while revalidating on client.
  return json(
    { ok: true, data },
    200,
    {
      'Cache-Control': 'private, max-age=10, stale-while-revalidate=25',
      Vary: 'Authorization',
    }
  );
  } finally {
    guard.release();
  }
}

