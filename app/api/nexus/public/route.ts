import { getPublicNexusData } from '@/lib/nexus/getPublicNexusData';
import type { NexusEcosystem } from '@/lib/nexus/getNexusData';
import { auditApiLog, logSlowRequest } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';

export const runtime = 'nodejs';

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export async function GET(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'nexus_public');
  if (!guard.ok) return guard.response;

  try {
  const url = new URL(request.url);
  const ecoRaw = (url.searchParams.get('ecosystem') ?? 'adult').toLowerCase();
  const ecosystem: NexusEcosystem = ecoRaw === 'k12' ? 'k12' : 'adult';
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const data = await getPublicNexusData(ecosystem);
  const ms = typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
  logSlowRequest('nexus_public', ms, { ecosystem });
  auditApiLog('nexus_public', { ecosystem, ms });
  if (process.env.NODE_ENV === 'development' && typeof performance !== 'undefined') {
    console.info(`[nexus/public] getPublicNexusData ${ms}ms`);
  }

  return json(
    { ok: true, data },
    200,
    {
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=45',
    }
  );
  } finally {
    guard.release();
  }
}
