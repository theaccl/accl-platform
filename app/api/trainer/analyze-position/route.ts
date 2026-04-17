import { Chess } from 'chess.js';
import { createClient } from '@supabase/supabase-js';
import { evaluateTrainerPositionUci } from '@/lib/analysis/engineComputeService';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { assertTrainerAnalysisAllowed } from '@/lib/trainer/trainerAnalysisGuard';
import {
  centipawnToHumanLine,
  classifyBestLineSpread,
  classifyMoveVsBest,
  type FormattedAlternative,
} from '@/lib/trainer/formatTrainerEvaluation';
import { getClientIp } from '@/lib/server/clientIp';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

const nativeFetch = globalThis.fetch.bind(globalThis);

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
    global: { fetch: nativeFetch },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user?.id ?? null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Body = { fen?: unknown; gameId?: unknown };

async function postTrainerAnalyze(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const userId = await resolveAuthenticatedUserId(request);
  const rlKey = userId ? `trainer-analyze:${userId}` : `trainer-analyze:${ip}`;
  const limited = checkRateLimit(rlKey, 45, 60_000);
  if (!limited.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'rate_limited',
        code: 'RATE_LIMIT',
        retry_after_sec: limited.retryAfterSec,
        availability: 'unavailable',
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(limited.retryAfterSec),
        },
      }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(
      { ok: false, error: 'invalid_json', code: 'BAD_JSON', availability: 'unavailable' },
      400
    );
  }

  const fen = String(body.fen ?? '').trim();
  const gameId =
    body.gameId != null && String(body.gameId).trim() !== '' ? String(body.gameId).trim() : null;

  try {
    new Chess(fen);
  } catch {
    return json({ ok: false, error: 'invalid_fen', code: 'BAD_FEN', availability: 'unavailable' }, 400);
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    const detail = e instanceof Error ? e.message.slice(0, 160) : '';
    console.error('[api/trainer/analyze-position] service_client_unavailable', detail);
    return json(
      {
        ok: false,
        error: 'Server is not configured for trainer analysis.',
        code: 'SUPABASE_CONFIG',
        availability: 'unavailable',
      },
      503
    );
  }

  const guard = await assertTrainerAnalysisAllowed(supabase, { fen, gameId, userId });
  if (!guard.ok) {
    return json(
      { ok: false, error: guard.message, code: guard.code, availability: 'blocked' },
      guard.httpStatus
    );
  }

  let uci;
  try {
    uci = await evaluateTrainerPositionUci(fen, { depth: 11, multiPv: 3, timeoutMs: 9000 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'engine_error';
    if (msg.includes('engine_eval_timeout')) {
      return json(
        {
          ok: false,
          error: 'Engine timed out — try again or simplify.',
          code: 'ENGINE_TIMEOUT',
          availability: 'degraded',
        },
        504
      );
    }
    console.error('[api/trainer/analyze-position] engine_failed', msg.slice(0, 160));
    return json(
      {
        ok: false,
        error: 'Engine analysis is not available on this deployment (Stockfish UCI could not run).',
        code: 'ENGINE_ERROR',
        availability: 'unavailable',
        reason: 'uci_or_engine_init_failed',
      },
      503
    );
  }

  const lines = uci.lines;
  const best = lines[0];
  const second = lines[1];
  const spreadClass =
    best && second && best.scoreCp != null && second.scoreCp != null
      ? classifyBestLineSpread(Math.abs(best.scoreCp - second.scoreCp))
      : 'Good';

  const alternatives: FormattedAlternative[] = lines.slice(0, 3).map((L, i) => ({
    rank: L.rank,
    move: L.move,
    centipawn: L.scoreCp,
    classification:
      i === 0
        ? 'Excellent'
        : classifyMoveVsBest(lines[0]?.scoreCp ?? null, L.scoreCp),
  }));

  return json({
    ok: true,
    fen,
    gameId,
    availability: 'available',
    summary: centipawnToHumanLine(best?.scoreCp ?? null),
    evaluation: {
      bestMove: uci.bestMove,
      centipawn: best?.scoreCp ?? null,
      alternatives,
      spreadClassification: spreadClass,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await postTrainerAnalyze(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    console.error('[api/trainer/analyze-position] unhandled', msg.slice(0, 200));
    return json(
      {
        ok: false,
        error: 'unexpected_error',
        code: 'INTERNAL',
        availability: 'unavailable',
      },
      500
    );
  }
}
