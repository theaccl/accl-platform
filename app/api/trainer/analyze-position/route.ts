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
import { tooManyRequests } from '@/lib/server/httpJson';

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

export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const userId = await resolveAuthenticatedUserId(request);
  const rlKey = userId ? `trainer-analyze:${userId}` : `trainer-analyze:${ip}`;
  const limited = checkRateLimit(rlKey, 45, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const fen = String(body.fen ?? '').trim();
  const gameId =
    body.gameId != null && String(body.gameId).trim() !== '' ? String(body.gameId).trim() : null;

  try {
    new Chess(fen);
  } catch {
    return json({ error: 'Invalid FEN' }, 400);
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Service configuration error' }, 503);
  }

  const guard = await assertTrainerAnalysisAllowed(supabase, { fen, gameId, userId });
  if (!guard.ok) {
    return json(
      { error: guard.message, code: guard.code },
      guard.httpStatus
    );
  }

  let uci;
  try {
    uci = await evaluateTrainerPositionUci(fen, { depth: 11, multiPv: 3, timeoutMs: 9000 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'engine_error';
    if (msg.includes('engine_eval_timeout')) {
      return json({ error: 'Engine timed out — try again or simplify.', code: 'ENGINE_TIMEOUT' }, 504);
    }
    return json({ error: 'Engine unavailable.', code: 'ENGINE_ERROR' }, 503);
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
    summary: centipawnToHumanLine(best?.scoreCp ?? null),
    evaluation: {
      bestMove: uci.bestMove,
      centipawn: best?.scoreCp ?? null,
      alternatives,
      spreadClassification: spreadClass,
    },
  });
}
