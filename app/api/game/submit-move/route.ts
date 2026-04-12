import { createClient } from '@supabase/supabase-js';
import fetchPolyfill from 'cross-fetch';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { buildAuthoritativeMovePatch } from '@/lib/gameStateSourceOfTruth';
import { Chess } from 'chess.js';
import { selectBotMove, type BotCandidateLine, type BotName } from '@/lib/bot/botPersonality';
import { auditApiLog, logSlowRequest, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';

type Body = {
  gameId?: unknown;
  fenBefore?: unknown;
  nextFen?: unknown;
  nextTurn?: unknown;
  statusBefore?: unknown;
  tempo?: unknown;
  liveTimeControl?: unknown;
  currentTurn?: unknown;
  whiteClockMs?: unknown;
  blackClockMs?: unknown;
  lastMoveAt?: unknown;
  move?: unknown;
  gameOver?: { result?: unknown; end_reason?: unknown } | null;
};

type AuthenticatedRequest = {
  userId: string;
  token: string;
};

async function resolveAuthenticatedRequest(request: Request): Promise<AuthenticatedRequest | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const token = m[1]?.trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    global: { fetch: fetchPolyfill as unknown as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  const userId = data.user?.id ?? null;
  if (!userId) return null;
  return { userId, token };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function conflictJson(details: {
  gameId: string;
  expectedFen: string | null;
  actualFen: string | null;
  dbError?: string;
}) {
  return json(
    {
      error: {
        code: 'optimistic_state_conflict',
        message: 'Game position changed before this move was committed.',
        retryable: true,
        game_id: details.gameId,
        expected_fen: details.expectedFen,
        actual_fen: details.actualFen,
        db_error: details.dbError ?? null,
      },
    },
    409
  );
}

const BOT_USER_IDS: Record<BotName, string> = {
  'Cardi Bot': '10000000-0000-0000-0000-000000000001',
  'Aggro Bot': '10000000-0000-0000-0000-000000000002',
  'Endgame Bot': '10000000-0000-0000-0000-000000000003',
};

function configuredBotUserIds(): Record<BotName, string> {
  return {
    'Cardi Bot': process.env.BOT_USER_ID_CARDI?.trim() || BOT_USER_IDS['Cardi Bot'],
    'Aggro Bot': process.env.BOT_USER_ID_AGGRO?.trim() || BOT_USER_IDS['Aggro Bot'],
    'Endgame Bot': process.env.BOT_USER_ID_ENDGAME?.trim() || BOT_USER_IDS['Endgame Bot'],
  };
}

function botNameFromUserId(userId: string): BotName | null {
  const hit = (Object.entries(configuredBotUserIds()) as Array<[BotName, string]>).find(([, id]) => id === userId);
  return hit?.[0] ?? null;
}

function sanitizeUciMove(move: string): string {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn]?)/i.exec(move.trim());
  if (!m) return '';
  return `${m[1]}${m[2]}${(m[3] ?? '').toLowerCase()}`;
}

function buildBotCandidatesFromFen(fen: string): BotCandidateLine[] {
  const board = new Chess(fen);
  const legal = board.moves({ verbose: true });
  return legal.slice(0, 12).map((mv) => {
    const uciSeed = `${mv.from}${mv.to}${mv.promotion ?? ''}`.toLowerCase();
    const uci = /[+#x]/i.test(mv.san) ? `${uciSeed}x` : uciSeed;
    const check = mv.san.includes('+') || mv.san.includes('#');
    const capture = mv.flags.includes('c') || mv.flags.includes('e');
    const promotion = Boolean(mv.promotion);
    const scoreCp = (capture ? 60 : 0) + (check ? 45 : 0) + (promotion ? 25 : 0);
    return {
      move: uci,
      scoreCp,
    };
  });
}

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequest(request, 'submit_move');
  if (!guard.ok) return guard.response;

  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  try {
  const auth = await resolveAuthenticatedRequest(request);
  if (!auth) {
    auditApiLog('submit_move', { result: 'unauthorized' });
    return json({ error: 'Unauthorized' }, 401);
  }
  const userId = auth.userId;
  const body = (await request.json().catch(() => ({}))) as Body;
  const gameId = String(body.gameId ?? '').trim();
  const fenBefore = String(body.fenBefore ?? '').trim();
  const nextFen = String(body.nextFen ?? '').trim();
  const nextTurn = String(body.nextTurn ?? '').trim();
  if (!gameId || !nextFen || !nextTurn) {
    auditApiLog('submit_move', { result: 'bad_request', user: shortId(userId) });
    return json({ error: 'Missing required fields' }, 400);
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    auditApiLog('submit_move', { result: 'service_config_error', user: shortId(userId) });
    return json({ error: e instanceof Error ? e.message : 'Service configuration error' }, 503);
  }

  const { data: gameRow, error: gameErr } = await supabase
    .from('games')
    .select('id,white_player_id,black_player_id')
    .eq('id', gameId)
    .single();
  if (gameErr || !gameRow) {
    auditApiLog('submit_move', { result: 'game_not_found', game_id: shortId(gameId), user: shortId(userId) });
    return json({ error: gameErr?.message ?? 'Game not found' }, 404);
  }
  if (gameRow.white_player_id !== userId && gameRow.black_player_id !== userId) {
    auditApiLog('submit_move', { result: 'forbidden', game_id: shortId(gameId), user: shortId(userId) });
    return json({ error: 'Forbidden: not a participant' }, 403);
  }

  const movePatch = buildAuthoritativeMovePatch({
    nextFen,
    nextTurn,
    statusBefore: String(body.statusBefore ?? 'active'),
    tempo: body.tempo == null ? null : String(body.tempo),
    liveTimeControl: body.liveTimeControl == null ? null : String(body.liveTimeControl),
    currentTurn: String(body.currentTurn ?? 'white'),
    whiteClockMs: typeof body.whiteClockMs === 'number' ? body.whiteClockMs : null,
    blackClockMs: typeof body.blackClockMs === 'number' ? body.blackClockMs : null,
    lastMoveAt: body.lastMoveAt == null ? null : String(body.lastMoveAt),
  });

  let update = supabase.from('games').update(movePatch).eq('id', gameId);
  if (fenBefore) update = update.eq('fen', fenBefore);
  const { data: updatedRow, error: updateErr } = await update.select('*').maybeSingle();
  if (updateErr || !updatedRow) {
    const current = await supabase.from('games').select('fen').eq('id', gameId).maybeSingle();
    const actualFen = String(current.data?.fen ?? '').trim() || null;
    auditApiLog('submit_move', {
      result: 'optimistic_conflict',
      game_id: shortId(gameId),
      user: shortId(userId),
      ms: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0,
    });
    return conflictJson({
      gameId,
      expectedFen: fenBefore || null,
      actualFen,
      dbError: updateErr?.message,
    });
  }

  const move = (body.move ?? {}) as {
    san?: string;
    from_sq?: string;
    to_sq?: string;
    move_duration_ms?: number;
  };
  await supabase.from('game_move_logs').insert({
    game_id: gameId,
    player_id: userId,
    san: String(move.san ?? ''),
    from_sq: String(move.from_sq ?? ''),
    to_sq: String(move.to_sq ?? ''),
    fen_before: fenBefore || null,
    fen_after: nextFen,
    move_duration_ms: Number(move.move_duration_ms ?? 0),
  });

  let finalRow = updatedRow;
  const gameOver = body.gameOver;
  const result = String(gameOver?.result ?? '').trim();
  const endReason = String(gameOver?.end_reason ?? '').trim();
  if (result) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !anon) {
      auditApiLog('submit_move', { result: 'missing_anon_config', game_id: shortId(gameId), user: shortId(userId) });
      return json({ error: 'Missing Supabase anon client configuration' }, 503);
    }
    const participantClient = createClient(url, anon, {
      global: {
        fetch: fetchPolyfill as unknown as typeof fetch,
        headers: { Authorization: `Bearer ${auth.token}` },
      },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: finished, error: finishErr } = await participantClient.rpc('finish_game', {
      p_game_id: gameId,
      p_result: result,
      p_end_reason: endReason || null,
    });
    if (finishErr) {
      auditApiLog('submit_move', {
        result: 'finish_rpc_error',
        game_id: shortId(gameId),
        user: shortId(userId),
      });
      return json({ error: finishErr.message }, 409);
    }
    finalRow = finished;
  }

  // Auto bot response for active bot games after the human move is committed.
  if (
    !result &&
    String(finalRow?.status ?? '') === 'active' &&
    String(finalRow?.source_type ?? '') === 'bot_game'
  ) {
    const isWhiteTurn = String(finalRow.turn ?? '') === 'white';
    const sideToMoveUserId = isWhiteTurn ? String(finalRow.white_player_id ?? '') : String(finalRow.black_player_id ?? '');
    const botName = botNameFromUserId(sideToMoveUserId);
    if (botName) {
      const fenNow = String(finalRow.fen ?? '').trim();
      const candidates = buildBotCandidatesFromFen(fenNow);
      const selected = selectBotMove(botName, candidates);
      if (selected) {
        const board = new Chess(fenNow);
        const selectedUci = sanitizeUciMove(selected.move);
        if (!selectedUci) {
          auditApiLog('submit_move', {
            result: 'ok',
            game_id: shortId(gameId),
            user: shortId(userId),
            ms: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0,
          });
          return json({ ok: true, row: finalRow }, 200);
        }
        const moved = board.move({
          from: selectedUci.slice(0, 2),
          to: selectedUci.slice(2, 4),
          promotion: (selectedUci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
        });
        if (moved) {
          const botNextFen = board.fen();
          const botNextTurn = board.turn() === 'w' ? 'white' : 'black';
          const botPatch = buildAuthoritativeMovePatch({
            nextFen: botNextFen,
            nextTurn: botNextTurn,
            statusBefore: String(finalRow.status ?? 'active'),
            tempo: finalRow.tempo == null ? null : String(finalRow.tempo),
            liveTimeControl: finalRow.live_time_control == null ? null : String(finalRow.live_time_control),
            currentTurn: String(finalRow.turn ?? 'white'),
            whiteClockMs: typeof finalRow.white_clock_ms === 'number' ? finalRow.white_clock_ms : null,
            blackClockMs: typeof finalRow.black_clock_ms === 'number' ? finalRow.black_clock_ms : null,
            lastMoveAt: finalRow.last_move_at == null ? null : String(finalRow.last_move_at),
          });
          const { data: botUpdated } = await supabase
            .from('games')
            .update(botPatch)
            .eq('id', gameId)
            .eq('fen', fenNow)
            .select('*')
            .single();
          if (botUpdated) {
            await supabase.from('game_move_logs').insert({
              game_id: gameId,
              player_id: sideToMoveUserId,
              san: moved.san,
              from_sq: moved.from,
              to_sq: moved.to,
              fen_before: fenNow,
              fen_after: botNextFen,
              move_duration_ms: 0,
            });
            finalRow = botUpdated;
          }
        }
      }
    }
  }

  const elapsed =
    typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
  logSlowRequest('submit_move', elapsed, { user: shortId(userId) });
  auditApiLog('submit_move', {
    result: 'ok',
    game_id: shortId(gameId),
    user: shortId(userId),
    ms: elapsed,
  });
  return json({ ok: true, row: finalRow }, 200);
  } finally {
    guard.release();
  }
}
