import { createClient } from '@supabase/supabase-js';

import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  ProtectedAnalysisPrecheckError,
  runProtectedAnalysisRequest,
} from '@/lib/analysis/protectedAnalysisServer';
import { ProtectedReviewRuntimeDisabledError } from '@/lib/analysis/protectedReviewRuntime.server';
import { parseProtectedAnalysisBody } from '@/lib/analysis/protectedAnalysisHttp';
import {
  ChessTruthError,
  IntegrityControlUnavailableError,
  SupabaseModeratorQueueStore,
} from '@/lib/analysis';
import {
  EngineRuntimeConfigurationError,
  EngineRuntimeRemoteError,
  runtimeHttpStatus,
} from '@/lib/chess/runtime';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const preferredRegion = 'iad1';

const nativeFetch = globalThis.fetch.bind(globalThis);
const stableFetch: typeof fetch = (...args) => nativeFetch(...args);

type ProtectedAnalysisBody = {
  fen?: unknown;
  mode?: unknown;
  gameId?: unknown;
};

function jsonError(
  message: string,
  status: number,
  options?: { code?: string; retryable?: boolean; retryAfterSeconds?: number }
): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.retryAfterSeconds) {
    headers['Retry-After'] = String(options.retryAfterSeconds);
  }
  return new Response(JSON.stringify({ error: message, ...options }), {
    status,
    headers,
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
  const parsed = parseProtectedAnalysisBody(body);
  if (!parsed.ok) return jsonError(parsed.error, parsed.status);
  const { fen, mode, gameId } = parsed.value;

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
      moderatorQueueSink,
      signal: request.signal,
    });
  } catch (e) {
    if (e instanceof ProtectedAnalysisPrecheckError) {
      return jsonError(e.message, e.status);
    }
    if (e instanceof IntegrityControlUnavailableError) {
      return jsonError('INTEGRITY_CONTROL_UNAVAILABLE', 503, {
        code: 'INTEGRITY_CONTROL_UNAVAILABLE',
        retryable: true,
        retryAfterSeconds: 1,
      });
    }
    if (e instanceof EngineRuntimeRemoteError) {
      const failure = e.envelope.error;
      return jsonError(failure.code, runtimeHttpStatus(failure.code), {
        code: failure.code,
        retryable: failure.retryable,
        retryAfterSeconds: failure.retryable ? 1 : undefined,
      });
    }
    if (
      e instanceof ProtectedReviewRuntimeDisabledError ||
      e instanceof EngineRuntimeConfigurationError
    ) {
      return jsonError('ENGINE_POOL_UNAVAILABLE', 503, {
        code: 'ENGINE_POOL_UNAVAILABLE',
        retryable: true,
        retryAfterSeconds: 1,
      });
    }
    if (e instanceof ChessTruthError) {
      return jsonError(e.code, e.code === 'INVALID_FEN' ? 400 : 503, {
        code: e.code,
        retryable: e.code !== 'INVALID_FEN',
        retryAfterSeconds: e.code === 'INVALID_FEN' ? undefined : 1,
      });
    }
    return jsonError('Protected analysis failed', 500);
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
