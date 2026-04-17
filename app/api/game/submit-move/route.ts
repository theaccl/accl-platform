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
  move?: unknown;
};

type AuthenticatedRequest = {
  userId: string;
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
  return { userId };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function badMoveJson(message: string, status = 409): Response {
  return json({ error: 'invalid_move', message }, status);
}

function conflictJson(details: {
  gameId: string;
  expectedFen: string | null;
  actualFen: string | null;
}) {
  return json(
    {
      error: {
        code: 'optimistic_state_conflict',
        message: 'Game position changed before this move was committed. Refresh and try again.',
        retryable: true,
        game_id: details.gameId,
        expected_fen: details.expectedFen,
        actual_fen: details.actualFen,
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

function sanitizeSquare(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  return /^[a-h][1-8]$/.test(s) ? s : '';
}

function sanitizePromotion(raw: unknown): 'q' | 'r' | 'b' | 'n' | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'q' || s === 'r' || s === 'b' || s === 'n') return s;
  return undefined;
}

function terminalStateFromBoard(board: Chess, moverColor: 'white' | 'black'): { result: string; endReason: string } | null {
  if (board.isCheckmate()) {
    return { result: moverColor === 'white' ? 'white_win' : 'black_win', endReason: 'checkmate' };
  }
  if (board.isStalemate()) {
    return { result: 'draw', endReason: 'stalemate' };
  }
  if (board.isThreefoldRepetition()) {
    return { result: 'draw', endReason: 'threefold_repetition' };
  }
  if (board.isInsufficientMaterial()) {
    return { result: 'draw', endReason: 'insufficient_material' };
  }
  if (board.isDrawByFiftyMoves()) {
    return { result: 'draw', endReason: 'fifty_move_rule' };
  }
  if (board.isDraw()) {
    return { result: 'draw', endReason: 'draw' };
  }
  return null;
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
    return json({ error: 'Unauthorized', message: 'Sign in again to make moves.' }, 401);
  }
  const userId = auth.userId;
  const body = (await request.json().catch(() => ({}))) as Body;
  const gameId = String(body.gameId ?? '').trim();
  const fenBefore = String(body.fenBefore ?? '').trim();
  if (!gameId) {
    auditApiLog('submit_move', { result: 'bad_request', user: shortId(userId) });
    return json(
      { error: 'invalid_request', message: 'Game id is required.' },
      400,
    );
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    auditApiLog('submit_move', { result: 'service_config_error', user: shortId(userId) });
    return json(
      { error: 'service_unavailable', message: 'Service temporarily unavailable. Try again in a moment.' },
      503,
    );
  }

  const { data: gameRow, error: gameErr } = await supabase
    .from('games')
    .select(
      'id,fen,turn,status,tempo,live_time_control,last_move_at,white_clock_ms,black_clock_ms,white_player_id,black_player_id,source_type'
    )
    .eq('id', gameId)
    .single();
  if (gameErr || !gameRow) {
    auditApiLog('submit_move', {
      result: 'game_not_found',
      game_id: shortId(gameId),
      user: shortId(userId),
    });
    return json(
      { error: 'game_unavailable', message: 'This game is not available or no longer exists.' },
      404,
    );
  }
  if (gameRow.white_player_id !== userId && gameRow.black_player_id !== userId) {
    auditApiLog('submit_move', { result: 'forbidden', game_id: shortId(gameId), user: shortId(userId) });
    return json(
      { error: 'forbidden', message: 'You are not a player in this game.' },
      403,
    );
  }
  if (!gameRow.white_player_id || !gameRow.black_player_id || gameRow.white_player_id === gameRow.black_player_id) {
    auditApiLog('submit_move', { result: 'not_both_seated', game_id: shortId(gameId), user: shortId(userId) });
    return badMoveJson('Game has not started. Both seats must be filled before moves are allowed.');
  }
  const normalizedStatus = String(gameRow.status ?? '').trim().toLowerCase();
  if (normalizedStatus !== 'active' && normalizedStatus !== 'waiting') {
    auditApiLog('submit_move', { result: 'invalid_status', game_id: shortId(gameId), user: shortId(userId) });
    return badMoveJson('Game is not in a playable state.');
  }
  const actorColor: 'white' | 'black' = gameRow.white_player_id === userId ? 'white' : 'black';
  const currentTurn = String(gameRow.turn ?? '').trim().toLowerCase();
  if (currentTurn !== actorColor) {
    auditApiLog('submit_move', { result: 'out_of_turn', game_id: shortId(gameId), user: shortId(userId) });
    return badMoveJson('It is not your turn.');
  }
  if (fenBefore && fenBefore !== String(gameRow.fen ?? '').trim()) {
    const actualFen = String(gameRow.fen ?? '').trim() || null;
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
    });
  }

  const inputMove = (body.move ?? {}) as {
    from_sq?: unknown;
    to_sq?: unknown;
    promotion?: unknown;
    move_duration_ms?: unknown;
  };
  const fromSquare = sanitizeSquare(inputMove.from_sq);
  const toSquare = sanitizeSquare(inputMove.to_sq);
  const promotion = sanitizePromotion(inputMove.promotion);
  if (!fromSquare || !toSquare) {
    auditApiLog('submit_move', { result: 'bad_move_shape', game_id: shortId(gameId), user: shortId(userId) });
    return badMoveJson('Move coordinates are required.');
  }

  let board: Chess;
  try {
    board = new Chess(String(gameRow.fen ?? '').trim());
  } catch {
    auditApiLog('submit_move', { result: 'invalid_server_fen', game_id: shortId(gameId), user: shortId(userId) });
    return json({ error: 'game_unavailable', message: 'Game position is invalid. Please refresh.' }, 409);
  }
  const moved = board.move({ from: fromSquare, to: toSquare, promotion });
  if (!moved) {
    auditApiLog('submit_move', { result: 'illegal_move', game_id: shortId(gameId), user: shortId(userId) });
    return badMoveJson('Illegal move.');
  }

  const nextFen = board.fen();
  const nextTurn = board.turn() === 'w' ? 'white' : 'black';
  const terminal = terminalStateFromBoard(board, actorColor);

  const movePatch = buildAuthoritativeMovePatch({
    nextFen,
    nextTurn,
    statusBefore: String(gameRow.status ?? 'active'),
    tempo: gameRow.tempo == null ? null : String(gameRow.tempo),
    liveTimeControl: gameRow.live_time_control == null ? null : String(gameRow.live_time_control),
    currentTurn: String(gameRow.turn ?? 'white'),
    whiteClockMs: typeof gameRow.white_clock_ms === 'number' ? gameRow.white_clock_ms : null,
    blackClockMs: typeof gameRow.black_clock_ms === 'number' ? gameRow.black_clock_ms : null,
    lastMoveAt: gameRow.last_move_at == null ? null : String(gameRow.last_move_at),
  });

  const { data: updatedRow, error: updateErr } = await supabase.rpc('apply_move_and_maybe_finish_system', {
    p_game_id: gameId,
    p_expected_fen: String(gameRow.fen ?? '').trim(),
    p_next_fen: movePatch.fen,
    p_next_turn: movePatch.turn,
    p_last_move_at: movePatch.last_move_at,
    p_move_deadline_at: movePatch.move_deadline_at,
    p_white_clock_ms: movePatch.white_clock_ms ?? null,
    p_black_clock_ms: movePatch.black_clock_ms ?? null,
    p_promote_waiting_to_active: movePatch.status === 'active',
    p_result: terminal?.result ?? null,
    p_end_reason: terminal?.endReason ?? null,
  });
  if (updateErr || !updatedRow) {
    const current = await supabase.from('games').select('fen').eq('id', gameId).maybeSingle();
    const actualFen = String(current.data?.fen ?? '').trim() || null;
    const dbMsg = String(updateErr?.message ?? '').toLowerCase();
    if (dbMsg.includes('optimistic_conflict')) {
      auditApiLog('submit_move', {
        result: 'optimistic_conflict',
        game_id: shortId(gameId),
        user: shortId(userId),
        ms: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0,
      });
      return conflictJson({
        gameId,
        expectedFen: String(gameRow.fen ?? '').trim() || null,
        actualFen,
      });
    }
    auditApiLog('submit_move', { result: 'move_commit_failed', game_id: shortId(gameId), user: shortId(userId) });
    return json(
      { error: 'move_commit_failed', message: 'Move could not be committed. Refresh and try again.' },
      409,
    );
  }

  await supabase.from('game_move_logs').insert({
    game_id: gameId,
    player_id: userId,
    san: moved.san,
    from_sq: moved.from,
    to_sq: moved.to,
    fen_before: String(gameRow.fen ?? '').trim() || null,
    fen_after: nextFen,
    move_duration_ms: Number(inputMove.move_duration_ms ?? 0),
  });

  let finalRow = updatedRow;

  // Auto bot response for active bot games after the human move is committed.
  if (
    !terminal &&
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
            const botMoverColor: 'white' | 'black' = isWhiteTurn ? 'white' : 'black';
            const botTerminal = terminalStateFromBoard(board, botMoverColor);
            if (botTerminal) {
              const { data: finishedAfterBot, error: botFinishErr } = await supabase.rpc('finish_game_system', {
                p_game_id: gameId,
                p_result: botTerminal.result,
                p_end_reason: botTerminal.endReason,
              });
              if (!botFinishErr && finishedAfterBot) {
                finalRow = finishedAfterBot;
              }
            }
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
