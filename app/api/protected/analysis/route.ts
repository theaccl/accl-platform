import { createClient } from '@supabase/supabase-js';

import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  ProtectedAnalysisPrecheckError,
  runProtectedAnalysisRequest,
} from '@/lib/analysis/protectedAnalysisServer';
import { SupabaseModeratorQueueStore, type IntelligenceMode, type OverlapInput } from '@/lib/analysis';

export const runtime = 'nodejs';

const nativeFetch = globalThis.fetch.bind(globalThis);
const stableFetch: typeof fetch = (...args) => nativeFetch(...args);

type ProtectedAnalysisBody = {
  fen?: unknown;
  mode?: unknown;
  gameId?: unknown;
  overlap?: OverlapInput;
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
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

export async function POST(request: Request): Promise<Response> {
  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) return jsonError('Unauthorized', 401);

  let body: ProtectedAnalysisBody;
  try {
    body = (await request.json()) as ProtectedAnalysisBody;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const fen = String(body.fen ?? '').trim();
  if (!fen) return jsonError('fen is required', 400);
  const mode = String(body.mode ?? 'coach').trim() as IntelligenceMode;
  if (!['coach', 'analyst', 'explainer'].includes(mode)) {
    return jsonError('mode must be one of: coach | analyst | explainer', 400);
  }
  const gameId =
    body.gameId != null && String(body.gameId).trim() !== '' ? String(body.gameId).trim() : null;

  let serviceClient;
  try {
    serviceClient = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Service configuration error';
    return jsonError(msg, 503);
  }

  const moderatorQueueSink = new SupabaseModeratorQueueStore(serviceClient);
  let result;
  try {
    result = await runProtectedAnalysisRequest({
      serviceClient,
      userId,
      fen,
      mode,
      gameId,
      overlap: body.overlap,
      moderatorQueueSink,
    });
  } catch (e) {
    if (e instanceof ProtectedAnalysisPrecheckError) {
      return jsonError(e.message, e.status);
    }
    const msg = e instanceof Error ? e.message : 'Protected analysis failed';
    return jsonError(msg, 500);
  }

  return new Response(
    JSON.stringify({
      ok: result.ok,
      responseLevel: result.responseLevel,
      truth: result.truth,
      refusal: result.refusal,
      enforcement: result.audit.enforcement,
      audit: result.audit,
      moderator_queue: result.audit.moderatorQueuePayload,
    }),
    { status: result.ok ? 200 : 403, headers: { 'Content-Type': 'application/json' } }
  );
}
